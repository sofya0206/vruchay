import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { OrgRole } from '@prisma/client';
import type { AuthenticatedRequest } from './auth.guard';

export const ROLES_KEY = 'auth:roles';

/**
 * Ограничение доступа по роли в организации.
 *
 * Роли лежали в базе с первого дня, но нигде не проверялись. Пока учётные записи
 * заводятся только через seed, эксплуатировать это нечем — но в момент появления
 * приглашения участников любой приглашённый смог бы удалять документы
 * и подключать почтовые домены. Гейт нужен раньше приглашений, а не после.
 */
export const Roles = (...roles: OrgRole[]) => SetMetadata(ROLES_KEY, roles);

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<OrgRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;

    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    // AuthGuard уже подтвердил членство по базе и положил роль в currentUser.
    const role = req.currentUser?.role as OrgRole | undefined;
    if (!role || !required.includes(role)) {
      throw new ForbiddenException('Недостаточно прав для этого действия');
    }
    return true;
  }
}
