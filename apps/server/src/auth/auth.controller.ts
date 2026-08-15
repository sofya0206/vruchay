import { Body, Controller, Get, Post, Req, UseGuards, UsePipes } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { Throttle } from '../common/throttle.decorator';
import { ThrottleGuard } from '../common/throttle.guard';
import { AuthService } from './auth.service';
import { RegistrationService } from './registration.service';
import { PasswordResetService } from './password-reset.service';
import { AuthGuard, AuthenticatedRequest } from './auth.guard';

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
  ) {}

  // Подбор пароля: не более 10 попыток с одного адреса за 5 минут.
  @Post('login')
  @Throttle({ max: 10, timeWindow: '5 minutes' })
  @UsePipes(new ZodValidationPipe(loginSchema))
  async login(@Body() dto: LoginDto, @Req() req: FastifyRequest) {
    const user = await this.auth.login(dto.email, dto.password);
    req.session.set('userId', user.userId);
    req.session.set('orgId', user.orgId);
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
    req.session.set('userId', user.userId);
    req.session.set('orgId', user.orgId);
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
    req.session.set('userId', user.userId);
    req.session.set('orgId', user.orgId);
    return { email: user.email, name: user.name, role: user.role };
  }

  @Post('logout')
  logout(@Req() req: FastifyRequest) {
    req.session.delete();
    return { ok: true };
  }

  @Get('me')
  @UseGuards(AuthGuard)
  me(@Req() req: FastifyRequest) {
    const { email, name, role, orgId } = (req as unknown as AuthenticatedRequest).currentUser;
    // Свои мы или клиент — нужно кабинету, чтобы не показывать разделы,
    // за которыми клиента ждёт отказ. Права всё равно проверяет сервер;
    // это про то, чтобы не звать человека туда, куда ему нельзя.
    const platformOrgId = process.env.PLATFORM_ORG_ID ?? '';
    return { email, name, role, isPlatform: Boolean(platformOrgId) && orgId === platformOrgId };
  }
}
