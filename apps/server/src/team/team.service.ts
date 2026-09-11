import { randomBytes, createHash } from 'node:crypto';
import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { OrgRole } from '@prisma/client';
import IORedis from 'ioredis';
import { baseUrl, type Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { InjectRedis } from '../common/redis.module';
import { hashPassword, validatePasswordStrength, verifyPassword } from '../auth/password';
import { escapeHtml } from '../mail/mail-template';
import { PERMISSIONS, ROLE_TITLE } from './role-permissions';

/** Приглашение живёт неделю: успеть открыть письмо, но не бесконечно. */
const INVITE_TTL_SECONDS = 7 * 24 * 60 * 60;
const INVITE_PREFIX = 'invite:';

/**
 * Сотрудники организации и их права.
 *
 * До этого в организации мог быть ровно один человек — тот, кто её завёл.
 * Для организации это неработоспособно: списки готовит секретарь, подписывает
 * руководитель, а рассылает кто-то третий. Отдавать им один пароль на всех —
 * ровно то, из-за чего потом нельзя ответить, кто что выпустил.
 *
 * Приглашение не создаёт пароль за человека: мы отправляем ссылку, по которой
 * он задаёт пароль сам. Пароль, придуманный кем-то другим и присланный
 * письмом, живёт в почте вечно и обычно не меняется.
 */
@Injectable()
export class TeamService {
  private readonly logger = new Logger(TeamService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    @InjectRedis() private readonly redis: IORedis,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Кто состоит в организации. Пароли и их хеши наружу не отдаём никогда. */
  async list(orgId: string) {
    const members = await this.prisma.orgMember.findMany({
      where: { orgId },
      include: { user: { select: { id: true, email: true, name: true, emailVerifiedAt: true, createdAt: true } } },
      orderBy: { user: { createdAt: 'asc' } },
    });

    return {
      members: members.map((m) => ({
        userId: m.user.id,
        email: m.user.email,
        name: m.user.name,
        role: m.role,
        // Не подтверждён — значит приглашение отправлено, но человек
        // ещё не задал пароль и войти не может. Это надо показывать.
        pending: m.user.emailVerifiedAt === null,
        joinedAt: m.user.createdAt,
      })),
    };
  }

  /** Права ролей для показа в кабинете. */
  roles() {
    return {
      roles: (['owner', 'admin', 'member'] as const).map((role) => ({ role, title: ROLE_TITLE[role] })),
      permissions: PERMISSIONS,
    };
  }

  /**
   * Смена собственного пароля.
   *
   * Нынешний пароль спрашиваем обязательно: иначе оставленная без присмотра
   * открытая сессия превращается в захват учётной записи — достаточно
   * поменять пароль и войти позже самому.
   */
  async changePassword(userId: string, current: string, next: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Пользователь не найден');

    if (!(await verifyPassword(user.passwordHash, current))) {
      throw new BadRequestException('Нынешний пароль указан неверно');
    }
    const weak = validatePasswordStrength(next);
    if (weak) throw new BadRequestException(weak);
    if (current === next) throw new BadRequestException('Новый пароль совпадает с нынешним');

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await hashPassword(next) },
    });
  }

  /**
   * Пригласить сотрудника.
   *
   * Если человек уже зарегистрирован в сервисе — просто добавляем его
   * в организацию, второй учётной записи не заводим. Иначе у одного человека
   * накопились бы разные пароли для разных организаций.
   */
  async invite(params: {
    orgId: string;
    orgName: string;
    email: string;
    name: string;
    role: OrgRole;
    invitedBy: string;
  }) {
    const email = params.email.trim().toLowerCase();
    if (params.role === 'owner') {
      throw new BadRequestException('Владелец в организации один — передайте права отдельно');
    }

    const existing = await this.prisma.user.findUnique({ where: { email } });

    if (existing) {
      const already = await this.prisma.orgMember.findUnique({
        where: { orgId_userId: { orgId: params.orgId, userId: existing.id } },
      });
      if (already) throw new BadRequestException('Этот человек уже в вашей организации');

      await this.prisma.orgMember.create({
        data: { orgId: params.orgId, userId: existing.id, role: params.role },
      });
      await this.notifyAdded(email, params.orgName);
      return { added: true, invited: false };
    }

    // Заводим запись без пароля: он появится, когда человек откроет ссылку.
    // Пустая строка вместо хеша — заведомо невалидное значение для argon2,
    // войти с ним нельзя ни при каком пароле.
    const user = await this.prisma.user.create({
      data: { email, name: params.name.trim(), passwordHash: '', emailVerifiedAt: null },
    });
    await this.prisma.orgMember.create({
      data: { orgId: params.orgId, userId: user.id, role: params.role },
    });

    await this.sendInvite(user.id, email, params.orgName);
    return { added: false, invited: true };
  }

  /** Повторно отправить приглашение — письма теряются в спаме. */
  async resendInvite(orgId: string, userId: string, orgName: string) {
    const member = await this.prisma.orgMember.findUnique({
      where: { orgId_userId: { orgId, userId } },
      include: { user: true },
    });
    if (!member) throw new NotFoundException('Сотрудник не найден');
    if (member.user.emailVerifiedAt) {
      throw new BadRequestException('Этот человек уже вошёл — приглашение не нужно');
    }
    await this.sendInvite(userId, member.user.email, orgName);
    return { ok: true as const };
  }

  /**
   * Сменить роль.
   *
   * Владельца не трогаем и владельцем не назначаем: передача организации —
   * отдельное действие с другими последствиями, и путать его со сменой
   * роли сотрудника нельзя.
   */
  async setRole(orgId: string, userId: string, role: OrgRole, actingUserId: string) {
    if (userId === actingUserId) {
      throw new BadRequestException('Свою роль изменить нельзя');
    }
    if (role === 'owner') {
      throw new BadRequestException('Назначить владельца через смену роли нельзя');
    }
    const member = await this.prisma.orgMember.findUnique({
      where: { orgId_userId: { orgId, userId } },
    });
    if (!member) throw new NotFoundException('Сотрудник не найден');
    if (member.role === 'owner') {
      throw new ForbiddenException('Роль владельца изменить нельзя');
    }

    await this.prisma.orgMember.update({
      where: { orgId_userId: { orgId, userId } },
      data: { role },
    });
    return { ok: true as const };
  }

  /**
   * Убрать сотрудника из организации.
   *
   * Учётную запись не удаляем: человек может состоять и в других
   * организациях, а его выпущенные документы должны остаться в реестре.
   */
  async remove(orgId: string, userId: string, actingUserId: string) {
    if (userId === actingUserId) {
      throw new BadRequestException('Себя убрать нельзя — передайте организацию другому');
    }
    const member = await this.prisma.orgMember.findUnique({
      where: { orgId_userId: { orgId, userId } },
    });
    if (!member) throw new NotFoundException('Сотрудник не найден');
    if (member.role === 'owner') {
      throw new ForbiddenException('Владельца убрать нельзя');
    }

    await this.prisma.orgMember.delete({ where: { orgId_userId: { orgId, userId } } });
    return { ok: true as const };
  }

  /**
   * Человек открыл ссылку из приглашения и задаёт пароль.
   *
   * Здесь же подтверждаем адрес: письмо дошло, ссылкой воспользовались —
   * это и есть доказательство, отдельная проверка была бы лишним шагом.
   */
  async acceptInvite(token: string, password: string) {
    const userId = await this.redis.get(INVITE_PREFIX + hashToken(token));
    if (!userId) {
      throw new BadRequestException('Ссылка устарела или уже использована. Попросите выслать новую');
    }
    const weak = validatePasswordStrength(password);
    if (weak) throw new BadRequestException(weak);

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await hashPassword(password), emailVerifiedAt: new Date() },
    });
    await this.redis.del(INVITE_PREFIX + hashToken(token));

    const membership = await this.prisma.orgMember.findFirst({
      where: { userId },
      include: { org: { select: { id: true, name: true } } },
    });
    if (!membership) throw new BadRequestException('Организация не найдена');

    return {
      userId: user.id,
      orgId: membership.org.id,
      role: membership.role,
      email: user.email,
      name: user.name,
    };
  }

  private async sendInvite(userId: string, email: string, orgName: string): Promise<void> {
    const token = randomBytes(32).toString('base64url');
    await this.redis.set(INVITE_PREFIX + hashToken(token), userId, 'EX', INVITE_TTL_SECONDS);

    const link = `${this.publicUrl()}/invite?token=${encodeURIComponent(token)}`;
    const html =
      `<p style="font-size:15px">Здравствуйте!</p>` +
      `<p style="font-size:15px">Вас пригласили работать в «${escapeHtml(orgName)}» на сервисе «Вручай» — ` +
      `здесь готовят и рассылают грамоты, дипломы и сертификаты.</p>` +
      `<p style="font-size:15px">Нажмите кнопку и придумайте пароль — на это уйдёт минута.</p>` +
      `<p><a href="${link}" style="display:inline-block;background:#1F5D3F;color:#fff;` +
      `padding:12px 20px;border-radius:10px;text-decoration:none;font-size:15px">Войти в сервис</a></p>` +
      `<p style="font-size:13px;color:#666">Ссылка работает 7 дней. Если вы не ждали приглашения — ` +
      `просто не открывайте её, ничего не произойдёт.</p>`;

    await this.safeSend(email, `Приглашение в «${orgName}» — Вручай`, html);
  }

  private async notifyAdded(email: string, orgName: string): Promise<void> {
    const html =
      `<p style="font-size:15px">Здравствуйте!</p>` +
      `<p style="font-size:15px">Вас добавили в организацию «${escapeHtml(orgName)}» на сервисе «Вручай».</p>` +
      `<p style="font-size:15px">Входите как обычно — тем же адресом и паролем: ` +
      `<a href="${this.publicUrl()}">${this.publicUrl()}</a></p>`;
    await this.safeSend(email, `Вас добавили в «${orgName}» — Вручай`, html);
  }

  /**
   * Письмо не должно ронять действие: сотрудник уже добавлен в базу,
   * а приглашение всегда можно выслать повторно кнопкой.
   */
  private async safeSend(to: string, subject: string, html: string): Promise<void> {
    try {
      await this.mail.sendService(to, subject, html);
    } catch (err) {
      this.logger.error(`Письмо не ушло: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private publicUrl(): string {
    return baseUrl(this.config.get('PUBLIC_URL', { infer: true }));
  }
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
