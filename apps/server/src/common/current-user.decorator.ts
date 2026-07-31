import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/auth.guard';
import type { SessionUser } from '../auth/auth.service';

/**
 * Отдаёт проверенного пользователя вместе с orgId. Работает только под AuthGuard —
 * именно он кладёт currentUser в запрос после подтверждения сессии по базе.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): SessionUser => {
    const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    return req.currentUser;
  },
);
