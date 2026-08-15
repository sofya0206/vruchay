import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { AuthService, SessionUser } from './auth.service';
import { TokensService } from '../tokens/tokens.service';

export interface AuthenticatedRequest extends FastifyRequest {
  currentUser: SessionUser;
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

    if (typeof userId !== 'string' || typeof orgId !== 'string') {
      throw new UnauthorizedException('Требуется вход в систему');
    }

    const user = await this.auth.resolveSession(userId, orgId);
    if (!user) {
      req.session.delete();
      throw new UnauthorizedException('Требуется вход в систему');
    }

    (req as unknown as AuthenticatedRequest).currentUser = user;
    return true;
  }
}
