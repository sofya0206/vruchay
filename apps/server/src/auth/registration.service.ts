import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { randomBytes, createHash } from 'node:crypto';
import type Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { InjectRedis } from '../common/redis.module';
import { hashPassword, validatePasswordStrength } from './password';
import { maskEmail } from '../common/redact';
import { escapeHtml } from '../mail/mail-template';
import { ReferralService } from '../referral/referral.service';
import type { SessionUser } from './auth.service';

/** Ссылка подтверждения живёт сутки: дольше держать нечего, короче — неудобно. */
const TOKEN_TTL_SECONDS = 24 * 60 * 60;
const TOKEN_PREFIX = 'verify:';

@Injectable()
export class RegistrationService {
  private readonly logger = new Logger(RegistrationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly referral: ReferralService,
    @InjectRedis() private readonly redis: Redis,
  ) {}

  /**
   * Регистрация новой организации с владельцем.
   *
   * Возвращает void и ничего не сообщает о том, был ли адрес занят. Это не
   * небрежность: иначе форма регистрации превращается в способ проверять,
   * зарегистрирован ли человек в сервисе, — тот же приём, от которого
   * защищён вход (см. LOGIN_FAILED в AuthService). Владельцу занятого
   * адреса вместо этого уходит письмо о попытке регистрации.
   */
  async register(params: {
    email: string;
    password: string;
    orgName: string;
    name: string;
    /** Код приглашения из ссылки, если человек пришёл по ней. */
    ref?: string;
  }): Promise<void> {
    const email = params.email.trim().toLowerCase();

    const weak = validatePasswordStrength(params.password);
    if (weak) throw new BadRequestException(`Пароль слишком простой: ${weak}`);

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      this.logger.warn(`Регистрация на занятый адрес: ${maskEmail(email)}`);
      // Письмо настоящему владельцу адреса: если это он и забыл, что уже
      // зарегистрирован, — узнает; если не он, — увидит чужую попытку.
      await this.safeSend(
        email,
        'Вручай — попытка регистрации',
        `<p>Кто-то попытался зарегистрироваться в сервисе «Вручай» с вашим адресом.</p>
         <p>Учётная запись с этим адресом уже существует. Если это были вы —
         просто войдите: <a href="${this.publicUrl()}/login">${this.publicUrl()}/login</a>.</p>
         <p style="color:#5f6b64;font-size:13px">Если это были не вы, делать ничего не нужно:
         без пароля в вашу учётную запись никто не войдёт.</p>`,
      );
      return;
    }

    const passwordHash = await hashPassword(params.password);

    // Недействительный код молча пропускаем. Отказать в регистрации из-за
    // опечатки в чужой ссылке было бы несоразмерно: человек пришёл
    // пользоваться сервисом, а не предъявлять пропуск.
    const referredByOrgId = params.ref ? await this.referral.resolveCode(params.ref) : null;

    // Организация, владелец и членство создаются одной транзакцией: половина
    // регистрации хуже, чем её отсутствие — пользователь без организации
    // не сможет ни войти, ни зарегистрироваться заново.
    const user = await this.prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: { name: params.orgName.trim(), plan: 'free', referredByOrgId },
      });
      return tx.user.create({
        data: {
          email,
          name: params.name.trim(),
          passwordHash,
          memberships: { create: { orgId: org.id, role: 'owner' } },
        },
      });
    });

    await this.sendVerification(user.id, email);
    this.logger.log(`Зарегистрирована организация для ${maskEmail(email)}`);
  }

  /** Повторная отправка ссылки. Ответ одинаков независимо от того, есть ли адрес. */
  async resend(rawEmail: string): Promise<void> {
    const email = rawEmail.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.emailVerifiedAt) return;
    await this.sendVerification(user.id, email);
  }

  /**
   * Подтверждение адреса по ссылке из письма. При успехе возвращает данные
   * сессии — человек попадает в кабинет сразу, без повторного ввода пароля.
   */
  async verify(token: string): Promise<SessionUser> {
    const key = TOKEN_PREFIX + hashToken(token);
    const userId = await this.redis.get(key);
    if (!userId) {
      throw new BadRequestException(
        'Ссылка недействительна или устарела. Запросите новую на странице входа.',
      );
    }
    // Ссылка одноразовая: удаляем до всех остальных действий, чтобы
    // повторное открытие письма не создавало вторую сессию.
    await this.redis.del(key);

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { emailVerifiedAt: new Date() },
      include: { memberships: { take: 1, orderBy: { orgId: 'asc' } } },
    });

    const membership = user.memberships[0];
    if (!membership) {
      this.logger.error(`У пользователя ${user.id} нет организации после подтверждения`);
      throw new BadRequestException('Учётная запись повреждена, напишите в поддержку');
    }

    return {
      userId: user.id,
      orgId: membership.orgId,
      email: user.email,
      name: user.name,
      role: membership.role,
    };
  }

  private async sendVerification(userId: string, email: string): Promise<void> {
    const token = randomBytes(32).toString('base64url');
    // В Redis кладём хеш, а не сам токен: содержимое Redis утекает легче,
    // чем содержимое письма, и по хешу ссылку не восстановить.
    await this.redis.set(TOKEN_PREFIX + hashToken(token), userId, 'EX', TOKEN_TTL_SECONDS);

    const link = `${this.publicUrl()}/confirm?token=${encodeURIComponent(token)}`;
    await this.safeSend(
      email,
      'Вручай — подтвердите адрес почты',
      `<p style="font-size:15px">Здравствуйте!</p>
       <p>Чтобы начать пользоваться сервисом «Вручай», подтвердите адрес почты:</p>
       <p style="margin:24px 0">
         <a href="${escapeHtml(link)}"
            style="background:#1F5D3F;color:#fff;padding:12px 24px;border-radius:8px;
                   text-decoration:none;font-size:15px">Подтвердить адрес</a>
       </p>
       <p style="font-size:13px;color:#5f6b64">Ссылка действует сутки. Если кнопка не работает,
       откройте адрес вручную:<br><span style="word-break:break-all">${escapeHtml(link)}</span></p>
       <p style="font-size:13px;color:#5f6b64">Если вы не регистрировались в «Вручай»,
       просто удалите это письмо.</p>`,
    );
  }

  /**
   * Ошибка отправки не должна отменять уже созданную учётную запись:
   * человек сможет запросить письмо повторно, а вот потерянная регистрация
   * заставила бы его начинать заново — и наткнуться на «адрес уже занят».
   */
  private async safeSend(to: string, subject: string, html: string): Promise<void> {
    try {
      await this.mail.sendService(to, subject, html);
    } catch (e) {
      this.logger.error(
        `Не удалось отправить письмо на ${maskEmail(to)}: ${e instanceof Error ? e.message : e}`,
      );
    }
  }

  private publicUrl(): string {
    return (process.env.PUBLIC_URL ?? 'https://vruchay.ru').replace(/\/+$/, '');
  }
}

/**
 * Хеш токена для хранения. Сравнение по хешу, а не по самому токену, —
 * поиск по ключу в Redis и так постоянного времени, но хеш ещё и не даёт
 * восстановить ссылку из дампа Redis.
 */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
