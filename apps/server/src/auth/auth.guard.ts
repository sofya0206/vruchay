import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { AuthService, SessionUser } from './auth.service';
import { SessionService } from './session.service';
import { TokensService } from '../tokens/tokens.service';

export interface AuthenticatedRequest extends FastifyRequest {
  currentUser: SessionUser;
  /** Идентификатор сессии в базе; у входа по токену API его нет. */
  sessionId?: string;
}

/**
 * Кладёт в запрос проверенного пользователя вместе с orgId.
 * Все дальнейшие выборки фильтруются по этому orgId — идентификатор организации
 * никогда не берётся из тела или параметров запроса.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly tokens: TokensService,
    private readonly sessions: SessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<FastifyRequest>();

    // Сперва токен API: чужая система входить человеком не умеет.
    // Дальше приложению всё равно, кто пришёл, — правила доступа
    // к чужим материалам от способа входа не зависят.
    const byToken = await this.tokens.resolve(req.headers.authorization);
    if (byToken) {
      (req as unknown as AuthenticatedRequest).currentUser = byToken;
      return true;
    }

    const userId: unknown = req.session?.get('userId');
    const orgId: unknown = req.session?.get('orgId');
    const sid: unknown = req.session?.get('sid');

    if (typeof userId !== 'string' || typeof orgId !== 'string' || typeof sid !== 'string') {
      throw new UnauthorizedException('Требуется вход в систему');
    }

    // Сессия могла быть завершена с другого устройства — проверяем по базе,
    // а не доверяем cookie: иначе «выйти везде» не значило бы ничего.
    const [user, session] = await Promise.all([
      this.auth.resolveSession(userId, orgId),
      this.sessions.resolve(sid, userId),
    ]);
    if (!user || !session) {
      req.session.delete();
      throw new UnauthorizedException('Требуется вход в систему');
    }

    const authed = req as unknown as AuthenticatedRequest;
    authed.currentUser = user;
    authed.sessionId = session.id;
    return true;
  }
}
