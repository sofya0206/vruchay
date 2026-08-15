import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthenticatedRequest } from './auth.guard';
import type { Env } from '../config/env';

/**
 * Доступ к собственной кухне сервиса: счета и заявки с посадочной.
 *
 * Это не данные организации-клиента, а наша бухгалтерия и наши будущие
 * клиенты: имена покупателей, ИНН, суммы, контакты тех, кто оставил
 * заявку. Роль «владелец» тут ничего не значит — владелец есть у каждой
 * организации, а регистрация у нас открытая, и без этой проверки любой
 * зарегистрировавшийся читал бы всю клиентскую книгу сервиса.
 *
 * Своей организацией сервиса считается та, чей идентификатор задан
 * в PLATFORM_ORG_ID. Это настройка, а не данные: признак «мы сами»
 * не должен жить в той же таблице, что и признаки клиентов, где его
 * можно было бы кому-нибудь проставить.
 *
 * Пустой PLATFORM_ORG_ID закрывает доступ всем. Так и задумано: потерять
 * на время свой список счетов неприятно, отдать его посторонним — хуже.
 */
@Injectable()
export class PlatformOnlyGuard implements CanActivate {
  constructor(private readonly config: ConfigService<Env, true>) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = req.currentUser;
    const platformOrgId = this.config.get('PLATFORM_ORG_ID', { infer: true });

    // Токен API сюда не пускаем ни при каких правах: счета — это деньги,
    // и отмечать их оплаченными должен человек.
    const allowed =
      Boolean(platformOrgId) &&
      user?.orgId === platformOrgId &&
      (user.role === 'owner' || user.role === 'admin') &&
      !user.viaToken;

    if (!allowed) throw new ForbiddenException('Раздел доступен только владельцу сервиса');
    return true;
  }
}
