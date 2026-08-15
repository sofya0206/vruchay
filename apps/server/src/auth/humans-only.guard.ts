import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { AuthenticatedRequest } from './auth.guard';

/**
 * Действие доступно только человеку, вошедшему паролем, — токену API нет.
 *
 * Закрываем всё, что управляет людьми: приглашение сотрудника, смена прав,
 * удаление из организации, смена пароля. Иначе токен, выданный «чтобы бот
 * выпускал грамоты», становится способом завести себе человеческий доступ
 * в обход владельца, а утёкший токен — способом отобрать организацию.
 *
 * Ставится рядом с AuthGuard и после него: решение принимается по уже
 * разобранному currentUser.
 */
@Injectable()
export class HumansOnlyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (req.currentUser?.viaToken) {
      throw new ForbiddenException(
        'Это действие доступно только человеку, вошедшему в кабинет. Токен API управлять сотрудниками не может.',
      );
    }
    return true;
  }
}
