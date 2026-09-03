import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentUser } from '../common/current-user.decorator';
import { AuthGuard } from '../auth/auth.guard';
import { HumansOnlyGuard } from '../auth/humans-only.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { Throttle } from '../common/throttle.decorator';
import { ThrottleGuard } from '../common/throttle.guard';
import type { SessionUser } from '../auth/auth.service';
import { uuidSchema } from '../documents/documents.dto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditActor } from '../audit/actor.decorator';
import { AuditService, type Actor } from '../audit/audit.service';
import { SessionService, clientMeta } from '../auth/session.service';
import { ROLE_TITLE } from './role-permissions';
import { TeamService } from './team.service';

const uuidParam = new ZodValidationPipe(uuidSchema);

const changePasswordSchema = z.object({
  current: z.string().min(1, 'Введите нынешний пароль'),
  next: z.string().min(1, 'Введите новый пароль').max(200),
});

const inviteSchema = z.object({
  email: z.string().trim().email('Проверьте адрес почты').max(254),
  name: z.string().trim().min(1, 'Укажите имя').max(120),
  role: z.enum(['admin', 'member']),
});

const roleSchema = z.object({ role: z.enum(['admin', 'member']) });


/**
 * Сотрудники организации.
 *
 * Приглашать и менять роли может владелец или администратор; смена
 * собственного пароля доступна любому вошедшему — это не про управление
 * организацией, а про свою учётную запись.
 */
/*
 * HumansOnlyGuard на весь контроллер: здесь всё про людей — кого позвать,
 * кому какие права, кого убрать. Токену API тут делать нечего ни в одном
 * из действий, поэтому запрет ставим один раз наверху, а не вспоминаем
 * о нём при добавлении каждого нового метода.
 */
@Controller('team')
@UseGuards(AuthGuard, HumansOnlyGuard, RolesGuard)
export class TeamController {
  constructor(
    private readonly team: TeamService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sessions: SessionService,
  ) {}

  @Get()
  list(@CurrentUser() user: SessionUser) {
    return this.team.list(user.orgId);
  }

  /** Что может каждая роль — одним списком, чтобы кабинет не пересказывал своими словами. */
  @Get('roles')
  roles() {
    return this.team.roles();
  }

  /**
   * Свой пароль меняет кто угодно — роль тут ни при чём. Остальные сессии
   * при этом закрываются: пароль меняют, когда он утёк, и тот, кто его
   * знал, не должен остаться внутри.
   */
  @Post('password')
  async changePassword(
    @CurrentUser() user: SessionUser,
    @Req() req: FastifyRequest,
    @Body(new ZodValidationPipe(changePasswordSchema)) dto: z.infer<typeof changePasswordSchema>,
  ) {
    await this.team.changePassword(user.userId, dto.current, dto.next);
    await this.sessions.revokeOthers(user.userId, req.session.get('sid'));
    return { ok: true as const };
  }

  @Post('invite')
  @Roles('owner', 'admin')
  async invite(
    @CurrentUser() user: SessionUser,
    @AuditActor() actor: Actor,
    @Body(new ZodValidationPipe(inviteSchema)) dto: z.infer<typeof inviteSchema>,
  ) {
    const result = await this.team.invite({
      orgId: user.orgId,
      orgName: await this.orgName(user.orgId),
      email: dto.email,
      name: dto.name,
      role: dto.role,
      invitedBy: user.userId,
    });
    await this.audit.record({
      actor,
      action: 'team.invite',
      summary: `Приглашён сотрудник ${dto.name} (${dto.email}), права: ${ROLE_TITLE[dto.role]}`,
      targetType: 'user',
      meta: { email: dto.email, role: dto.role },
    });
    return result;
  }

  @Post(':userId/resend')
  @Roles('owner', 'admin')
  async resend(@CurrentUser() user: SessionUser, @Param('userId', uuidParam) userId: string) {
    return this.team.resendInvite(user.orgId, userId, await this.orgName(user.orgId));
  }

  @Patch(':userId')
  @Roles('owner', 'admin')
  async setRole(
    @CurrentUser() user: SessionUser,
    @AuditActor() actor: Actor,
    @Param('userId', uuidParam) userId: string,
    @Body(new ZodValidationPipe(roleSchema)) dto: z.infer<typeof roleSchema>,
  ) {
    const result = await this.team.setRole(user.orgId, userId, dto.role, user.userId);
    await this.audit.record({
      actor,
      action: 'team.role',
      summary: `Права сотрудника ${await this.userLabel(userId)} изменены на «${ROLE_TITLE[dto.role]}»`,
      targetType: 'user',
      targetId: userId,
      meta: { role: dto.role },
    });
    return result;
  }

  @Delete(':userId')
  @Roles('owner', 'admin')
  async remove(
    @CurrentUser() user: SessionUser,
    @AuditActor() actor: Actor,
    @Param('userId', uuidParam) userId: string,
  ) {
    // Имя читаем до удаления: после него взять его будет неоткуда,
    // а строчка «удалён пользователь 3f7a…» в журнале бесполезна.
    const label = await this.userLabel(userId);
    const result = await this.team.remove(user.orgId, userId, user.userId);
    await this.audit.record({
      actor,
      action: 'team.remove',
      summary: `Сотрудник ${label} удалён из организации`,
      targetType: 'user',
      targetId: userId,
    });
    return result;
  }

  private async userLabel(userId: string): Promise<string> {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true },
    });
    if (!u) return 'неизвестный';
    return u.name ? `${u.name} (${u.email})` : u.email;
  }

  private async orgName(orgId: string): Promise<string> {
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { name: true },
    });
    return org?.name ?? 'организация';
  }
}

const acceptSchema = z.object({
  token: z.string().min(10).max(500),
  password: z.string().min(1, 'Придумайте пароль').max(200),
});

/**
 * Принятие приглашения — без входа: человек ещё не может войти,
 * в том и смысл приглашения.
 *
 * Раз без входа — значит под ограничением частоты, как и остальные
 * публичные адреса: иначе токен приглашения можно перебирать сколько
 * угодно, а каждая попытка заводит пароль и открывает сессию.
 */
@Controller('team-invite')
@UseGuards(ThrottleGuard)
export class TeamInviteController {
  constructor(
    private readonly team: TeamService,
    private readonly sessions: SessionService,
  ) {}

  @Post('accept')
  @Throttle({ max: 10, timeWindow: '15 minutes' })
  async accept(
    @Body(new ZodValidationPipe(acceptSchema)) dto: z.infer<typeof acceptSchema>,
    @Req() req: FastifyRequest,
  ) {
    const user = await this.team.acceptInvite(dto.token, dto.password);
    // Сразу входим: заставлять человека вводить только что придуманный
    // пароль ещё раз — бессмысленный шаг.
    await this.sessions.open(req, user, clientMeta(req));
    return { email: user.email, name: user.name, role: user.role };
  }
}
