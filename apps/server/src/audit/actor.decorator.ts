import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/auth.guard';
import type { Actor } from './audit.service';

/**
 * Кто совершает действие — для записи в журнал.
 *
 * Собирается в контроллере, а не в службе: службы делают работу и знают
 * только организацию, а «кто именно» знает запрос. Тянуть автора сквозь
 * все службы ради одной строчки в журнале значило бы менять их подписи
 * под нужды отчётности.
 *
 * Работает только под AuthGuard — это он кладёт currentUser в запрос.
 */
export const AuditActor = createParamDecorator((_data: unknown, ctx: ExecutionContext): Actor => {
  const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
  const user = req.currentUser;
  return {
    orgId: user.orgId,
    userId: user.userId,
    name: user.name,
    email: user.email,
    // Адрес пишем: журнал заводится ради разбора спорных случаев, а «с какого
    // адреса вошли» в таком разборе — первый вопрос. За прокси значение
    // приходит из X-Forwarded-For, которому Fastify доверяет только при
    // включённом trustProxy (см. main.ts).
    ip: req.ip,
  };
});
