import { Body, Controller, Get, Post, Req, UseGuards, UsePipes } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { Throttle } from '../common/throttle.decorator';
import { ThrottleGuard } from '../common/throttle.guard';
import { AuthService } from './auth.service';
import { AuthGuard, AuthenticatedRequest } from './auth.guard';

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Некорректный адрес электронной почты').max(254),
  password: z.string().min(1, 'Введите пароль').max(200),
});
type LoginDto = z.infer<typeof loginSchema>;

@Controller('auth')
@UseGuards(ThrottleGuard)
export class AuthController {
  constructor(private readonly auth: AuthService) {}

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

  @Post('logout')
  logout(@Req() req: FastifyRequest) {
    req.session.delete();
    return { ok: true };
  }

  @Get('me')
  @UseGuards(AuthGuard)
  me(@Req() req: FastifyRequest) {
    const { email, name, role } = (req as unknown as AuthenticatedRequest).currentUser;
    return { email, name, role };
  }
}
