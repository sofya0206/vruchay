import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { Throttle } from '../common/throttle.decorator';
import { ThrottleGuard } from '../common/throttle.guard';
import type { Env } from '../config/env';
import { AuthService } from './auth.service';
import { RegistrationService } from './registration.service';
import { PasswordResetService } from './password-reset.service';
import { AuthGuard, AuthenticatedRequest } from './auth.guard';
import { uuidSchema } from '../documents/documents.dto';
import { HumansOnlyGuard } from './humans-only.guard';
import { SessionService, clearSessionKeys, clientMeta } from './session.service';
import { TotpService } from './totp.service';
import { CurrentUser } from '../common/current-user.decorator';
import type { SessionUser } from './auth.service';

/** Сколько ждём код после верного пароля. Дольше — уже не «продолжение входа». */
const PENDING_LOGIN_TTL_MS = 5 * 60 * 1000;

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Некорректный адрес электронной почты').max(254),
  password: z.string().min(1, 'Введите пароль').max(200),
});
type LoginDto = z.infer<typeof loginSchema>;

const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email('Некорректный адрес электронной почты').max(254),
  password: z.string().min(1, 'Придумайте пароль').max(200),
  orgName: z.string().trim().min(2, 'Укажите название организации').max(200),
  name: z.string().trim().max(200).default(''),
  // Приманка: поле скрыто от человека и заполняется только роботом.
  // Отвечаем как при успехе, чтобы робот не понял, что его отсеяли.
  website: z.string().max(200).optional(),
  /** Код приглашения из ссылки друга. Чужой или испорченный просто игнорируем. */
  ref: z.string().trim().max(16).optional(),
});
type RegisterDto = z.infer<typeof registerSchema>;

const emailOnlySchema = z.object({
  email: z.string().trim().toLowerCase().email('Некорректный адрес электронной почты').max(254),
});
type EmailOnlyDto = z.infer<typeof emailOnlySchema>;

const verifySchema = z.object({
  token: z.string().min(10, 'Ссылка неполная').max(200),
});

/**
 * Код второго фактора: шесть цифр из приложения либо резервный код
 * с бумажки. Разбираем оба здесь одной строкой — какой именно пришёл,
 * решает TotpService.
 */
const codeSchema = z.object({
  code: z.string().trim().min(6, 'Введите код').max(20),
});
type CodeDto = z.infer<typeof codeSchema>;

const passwordAndCodeSchema = z.object({
  password: z.string().min(1, 'Введите пароль').max(200),
  code: z.string().trim().min(6, 'Введите код').max(20),
});

const passwordOnlySchema = z.object({
  password: z.string().min(1, 'Введите пароль').max(200),
});

const resetSchema = z.object({
  token: z.string().min(10, 'Ссылка неполная').max(200),
  password: z.string().min(1, 'Придумайте пароль').max(200),
});
type ResetDto = z.infer<typeof resetSchema>;
type VerifyDto = z.infer<typeof verifySchema>;

@Controller('auth')
@UseGuards(ThrottleGuard)
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly registration: RegistrationService,
    private readonly passwordReset: PasswordResetService,
    private readonly sessions: SessionService,
    private readonly totp: TotpService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  // Подбор пароля: не более 10 попыток с одного адреса за 5 минут.
  @Post('login')
  @Throttle({ max: 10, timeWindow: '5 minutes' })
  @UsePipes(new ZodValidationPipe(loginSchema))
  async login(@Body() dto: LoginDto, @Req() req: FastifyRequest) {
    const meta = clientMeta(req);
    const { user, totpRequired } = await this.auth.login(dto.email, dto.password, meta);

    /*
     * Пароль подошёл, но включён второй фактор — сессию ещё не открываем.
     * В cookie кладём только «чей пароль подошёл и когда»: этого мало,
     * чтобы что-нибудь сделать, и достаточно, чтобы принять код.
     */
    if (totpRequired) {
      clearSessionKeys(req);
      req.session.set('pendingUserId', user.userId);
      req.session.set('pendingAt', Date.now());
      return { totpRequired: true as const };
    }

    await this.sessions.open(req, user, meta);
    await this.sessions.recordLogin(user.userId, 'success', meta);
    return { email: user.email, name: user.name, role: user.role };
  }

  /**
   * Второй шаг входа: код из приложения или резервный код.
   *
   * Ограничение частоты жёстче, чем у пароля: у кода шесть цифр, и без
   * него перебор занял бы минуты. Ожидание живёт пять минут — за это
   * время код успевает набрать человек, но не успевает перебрать робот.
   */
  @Post('login/totp')
  @Throttle({ max: 5, timeWindow: '5 minutes' })
  @UsePipes(new ZodValidationPipe(codeSchema))
  async loginTotp(@Body() dto: CodeDto, @Req() req: FastifyRequest) {
    const pendingUserId: unknown = req.session?.get('pendingUserId');
    const pendingAt: unknown = req.session?.get('pendingAt');
    const fresh =
      typeof pendingAt === 'number' && Date.now() - pendingAt < PENDING_LOGIN_TTL_MS;

    if (typeof pendingUserId !== 'string' || !fresh) {
      req.session.delete();
      throw new UnauthorizedException('Вход не начат или слишком долго ждали. Введите пароль заново');
    }

    const meta = clientMeta(req);
    if (!(await this.totp.check(pendingUserId, dto.code))) {
      await this.sessions.recordLogin(pendingUserId, 'wrong_code', meta);
      throw new UnauthorizedException('Код не подошёл. Проверьте время на телефоне и попробуйте ещё раз');
    }

    const user = await this.auth.pendingUser(pendingUserId);
    if (!user) {
      req.session.delete();
      throw new UnauthorizedException('Требуется вход в систему');
    }

    await this.sessions.open(req, user, meta);
    await this.sessions.recordLogin(user.userId, 'success', meta);
    return { email: user.email, name: user.name, role: user.role };
  }

  /**
   * Регистрация новой организации.
   *
   * Ответ всегда одинаков — и когда организация создана, и когда адрес уже
   * занят, и когда сработала приманка. Форма регистрации не должна отвечать
   * на вопрос «зарегистрирован ли такой человек»: это готовый способ
   * собирать списки клиентов и подбирать пароли.
   *
   * Ограничение частоты жёстче, чем у входа: регистрация создаёт записи
   * в базе и шлёт письма, поэтому дороже и для нас, и для чужого ящика.
   */
  @Post('register')
  @Throttle({ max: 5, timeWindow: '10 minutes' })
  @UsePipes(new ZodValidationPipe(registerSchema))
  async register(@Body() dto: RegisterDto) {
    if (!dto.website) {
      await this.registration.register({
        email: dto.email,
        password: dto.password,
        orgName: dto.orgName,
        name: dto.name,
        ref: dto.ref,
      });
    }
    return { ok: true };
  }

  /** Повторная отправка письма. Ответ тоже всегда одинаков — по той же причине. */
  @Post('resend-verification')
  @Throttle({ max: 3, timeWindow: '10 minutes' })
  @UsePipes(new ZodValidationPipe(emailOnlySchema))
  async resend(@Body() dto: EmailOnlyDto) {
    await this.registration.resend(dto.email);
    return { ok: true };
  }

  /** Переход по ссылке из письма: подтверждаем адрес и сразу впускаем в кабинет. */
  @Post('verify')
  @Throttle({ max: 10, timeWindow: '10 minutes' })
  @UsePipes(new ZodValidationPipe(verifySchema))
  async verify(@Body() dto: VerifyDto, @Req() req: FastifyRequest) {
    const user = await this.registration.verify(dto.token);
    await this.sessions.open(req, user, clientMeta(req));
    return { email: user.email, name: user.name, role: user.role };
  }

  /**
   * «Забыли пароль» — отправка ссылки.
   *
   * Ответ всегда одинаков, есть такой адрес или нет: иначе форма
   * превращается в способ проверять, кто зарегистрирован в сервисе.
   * Ограничение частоты жёсткое — каждый запрос шлёт письмо в чужой ящик.
   */
  @Post('forgot')
  @Throttle({ max: 3, timeWindow: '15 minutes' })
  @UsePipes(new ZodValidationPipe(emailOnlySchema))
  async forgot(@Body() dto: EmailOnlyDto) {
    await this.passwordReset.request(dto.email);
    return { ok: true };
  }

  /** Новый пароль по ссылке из письма: сразу впускаем в кабинет. */
  @Post('reset')
  @Throttle({ max: 10, timeWindow: '15 minutes' })
  @UsePipes(new ZodValidationPipe(resetSchema))
  async reset(@Body() dto: ResetDto, @Req() req: FastifyRequest) {
    const user = await this.passwordReset.reset(dto.token, dto.password);
    // Прежние сессии закрываем все: пароль восстанавливают в том числе
    // потому, что в учётную запись зашёл кто-то чужой.
    await this.sessions.revokeAll(user.userId);
    await this.sessions.open(req, user, clientMeta(req));
    return { email: user.email, name: user.name, role: user.role };
  }

  @Post('logout')
  async logout(@Req() req: FastifyRequest) {
    await this.sessions.close(req);
    return { ok: true };
  }

  @Get('me')
  @UseGuards(AuthGuard)
  me(@Req() req: FastifyRequest) {
    const { email, name, role, orgId } = (req as unknown as AuthenticatedRequest).currentUser;
    // Свои мы или клиент — нужно кабинету, чтобы не показывать разделы,
    // за которыми клиента ждёт отказ. Права всё равно проверяет сервер;
    // это про то, чтобы не звать человека туда, куда ему нельзя.
    const platformOrgId = this.config.get('PLATFORM_ORG_ID', { infer: true });
    return { email, name, role, isPlatform: Boolean(platformOrgId) && orgId === platformOrgId };
  }
}

/**
 * Второй фактор входа: подключение, выключение, резервные коды.
 *
 * Токену API здесь делать нечего ни в одном действии — это управление
 * собственным входом человека, поэтому HumansOnlyGuard стоит на весь
 * контроллер. Роль ни при чём: каждый распоряжается своей учётной записью.
 */
@Controller('auth/totp')
@UseGuards(AuthGuard, HumansOnlyGuard, ThrottleGuard)
export class TotpController {
  constructor(private readonly totp: TotpService) {}

  @Get()
  status(@CurrentUser() user: SessionUser) {
    return this.totp.status(user.userId);
  }

  /** Новый секрет и ссылка для QR. В базу до подтверждения ничего не пишется. */
  @Post('setup')
  @Throttle({ max: 10, timeWindow: '10 minutes' })
  setup(@CurrentUser() user: SessionUser) {
    return this.totp.setup(user.userId, user.email);
  }

  @Post('enable')
  @Throttle({ max: 10, timeWindow: '10 minutes' })
  enable(
    @CurrentUser() user: SessionUser,
    @Body(new ZodValidationPipe(codeSchema)) dto: CodeDto,
  ) {
    return this.totp.enable(user.userId, dto.code);
  }

  @Post('disable')
  @Throttle({ max: 10, timeWindow: '10 minutes' })
  async disable(
    @CurrentUser() user: SessionUser,
    @Body(new ZodValidationPipe(passwordAndCodeSchema)) dto: z.infer<typeof passwordAndCodeSchema>,
  ) {
    await this.totp.disable(user.userId, dto.password, dto.code);
    return { ok: true as const };
  }

  /** Новые резервные коды: старые перестают действовать сразу. */
  @Post('backup-codes')
  @Throttle({ max: 5, timeWindow: '15 minutes' })
  regenerate(
    @CurrentUser() user: SessionUser,
    @Body(new ZodValidationPipe(passwordOnlySchema)) dto: z.infer<typeof passwordOnlySchema>,
  ) {
    return this.totp.regenerateBackupCodes(user.userId, dto.password);
  }
}

/**
 * Активные сессии и журнал входов — свои, а не организации.
 *
 * Чужую сессию не завершить и чужой журнал не прочитать: и то и другое
 * ищется по userId из сессии, а не по идентификатору из запроса.
 */
@Controller('auth/sessions')
@UseGuards(AuthGuard, HumansOnlyGuard)
export class SessionsController {
  constructor(private readonly sessions: SessionService) {}

  @Get()
  list(@CurrentUser() user: SessionUser, @Req() req: FastifyRequest) {
    return this.sessions.list(user.userId, req.session?.get('sid'));
  }

  @Get('logins')
  logins(@CurrentUser() user: SessionUser) {
    return this.sessions.loginHistory(user.userId);
  }

  /** Завершить все, кроме текущей. Отдельным маршрутом до `:id` — иначе он его перехватит. */
  @Delete('others')
  async revokeOthers(@CurrentUser() user: SessionUser, @Req() req: FastifyRequest) {
    const closed = await this.sessions.revokeOthers(user.userId, req.session?.get('sid'));
    return { closed };
  }

  @Delete(':id')
  async revoke(
    @CurrentUser() user: SessionUser,
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
  ) {
    await this.sessions.revoke(user.userId, id);
    return { ok: true as const };
  }
}
