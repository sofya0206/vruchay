import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes, createHash } from 'node:crypto';
import type Redis from 'ioredis';
import { baseUrl, type Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { InjectRedis } from '../common/redis.module';
import { hashPassword, validatePasswordStrength } from './password';
import { maskEmail } from '../common/redact';
import { escapeHtml } from '../mail/mail-template';
import type { SessionUser } from './auth.service';

/**
 * Ссылка восстановления живёт час.
 *
 * Заметно короче суточной ссылки подтверждения адреса, и намеренно: та
 * лишь подтверждает почту, а эта отдаёт доступ к учётной записи. Час —
 * столько, чтобы человек успел дойти до почты и не торопился, но чтобы
 * забытое в чужом ящике письмо не работало ключом неделю.
 */
const TOKEN_TTL_SECONDS = 60 * 60;
const TOKEN_PREFIX = 'reset:';

/**
 * Восстановление забытого пароля.
 *
 * Без этого человек, забывший пароль, заперт снаружи навсегда — а наши
 * пользователи пароли забывают, это часть работы с ними, а не редкий сбой.
 */
@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    @InjectRedis() private readonly redis: Redis,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Публичный адрес сервиса без косой черты — из проверенной схемы настроек. */
  private publicUrl(): string {
    return baseUrl(this.config.get('PUBLIC_URL', { infer: true }));
  }

  /**
   * Отправить ссылку.
   *
   * Ответ одинаков и когда адрес найден, и когда нет: иначе форма
   * «забыли пароль» превращается в способ проверять, кто есть в сервисе.
   * Та же причина, по которой молчит форма регистрации.
   */
  async request(rawEmail: string): Promise<void> {
    const email = rawEmail.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, emailVerifiedAt: true },
    });

    if (!user) {
      this.logger.log(`Запрос восстановления на незнакомый адрес ${maskEmail(email)}`);
      return;
    }

    // Неподтверждённому адресу шлём не восстановление, а подтверждение:
    // сбрасывать пароль на ящик, который ещё не доказал, что он его, —
    // значит отдать учётную запись тому, кто просто угадал адрес.
    if (!user.emailVerifiedAt) {
      this.logger.warn(`Восстановление для неподтверждённого адреса ${maskEmail(email)}`);
      return;
    }

    const token = randomBytes(32).toString('base64url');
    // В Redis кладём хеш, а не сам токен: содержимое Redis утекает легче,
    // чем содержимое письма, и по хешу ссылку не восстановить.
    await this.redis.set(TOKEN_PREFIX + hashToken(token), user.id, 'EX', TOKEN_TTL_SECONDS);

    const link = `${this.publicUrl()}/reset?token=${encodeURIComponent(token)}`;
    await this.safeSend(
      email,
      'Вручай — восстановление пароля',
      `<p style="font-size:15px">Здравствуйте!</p>
       <p>Вы запросили новый пароль для входа в «Вручай». Нажмите кнопку и придумайте новый:</p>
       <p style="margin:24px 0">
         <a href="${escapeHtml(link)}"
            style="background:#1F5D3F;color:#fff;padding:12px 24px;border-radius:8px;
                   text-decoration:none;font-size:15px">Придумать новый пароль</a>
       </p>
       <p style="font-size:13px;color:#5f6b64">Ссылка действует один час и сработает один раз.
       Если кнопка не работает, откройте адрес вручную:<br>
       <span style="word-break:break-all">${escapeHtml(link)}</span></p>
       <p style="font-size:13px;color:#5f6b64">Если вы не просили новый пароль, просто удалите
       это письмо — старый продолжит работать, и в вашу учётную запись никто не войдёт.</p>`,
    );

    this.logger.log(`Отправлена ссылка восстановления на ${maskEmail(email)}`);
  }

  /**
   * Задать новый пароль по ссылке из письма.
   *
   * При успехе возвращает данные сессии: человек попадает в кабинет
   * сразу. Заставлять его после смены пароля ещё раз вводить логин
   * и только что придуманный пароль — лишний шаг ровно там, где он
   * и так раздражён тем, что пароль забыл.
   */
  async reset(token: string, password: string): Promise<SessionUser> {
    const weak = validatePasswordStrength(password);
    if (weak) throw new BadRequestException(`Пароль слишком простой: ${weak}`);

    const key = TOKEN_PREFIX + hashToken(token);
    const userId = await this.redis.get(key);
    if (!userId) {
      throw new BadRequestException(
        'Ссылка недействительна или устарела. Запросите новую на странице входа.',
      );
    }
    // Ссылка одноразовая: удаляем до смены пароля, чтобы повторное
    // открытие письма не позволило сменить его второй раз.
    await this.redis.del(key);

    const passwordHash = await hashPassword(password);
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
      include: { memberships: { take: 1, orderBy: { orgId: 'asc' } } },
    });

    const membership = user.memberships[0];
    if (!membership) {
      this.logger.error(`У пользователя ${user.id} нет организации при восстановлении`);
      throw new BadRequestException('Учётная запись повреждена, напишите в поддержку');
    }

    this.logger.log(`Пароль восстановлен для ${maskEmail(user.email)}`);

    return {
      userId: user.id,
      orgId: membership.orgId,
      email: user.email,
      name: user.name,
      role: membership.role,
    };
  }

  /** Ошибка отправки не должна валить запрос: человек попробует ещё раз. */
  private async safeSend(to: string, subject: string, html: string): Promise<void> {
    try {
      await this.mail.sendService(to, subject, html);
    } catch (e) {
      this.logger.error(
        `Не удалось отправить письмо на ${maskEmail(to)}: ${e instanceof Error ? e.message : e}`,
      );
    }
  }
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

