import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { hashPassword, verifyPassword } from './password';

export interface SessionUser {
  userId: string;
  orgId: string;
  email: string;
  name: string;
  role: string;
}

/**
 * Одинаковое сообщение для «нет такого пользователя» и «неверный пароль»:
 * иначе форма входа превращается в способ проверить, зарегистрирован ли адрес.
 */
const LOGIN_FAILED = 'Неверный адрес электронной почты или пароль';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(private readonly prisma: PrismaService) {}

  async login(email: string, password: string): Promise<SessionUser> {
    const normalized = email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email: normalized },
      include: { memberships: { take: 1, orderBy: { orgId: 'asc' } } },
    });

    // Хеш-заглушка нужна, чтобы время ответа для несуществующего адреса
    // не отличалось от времени ответа при неверном пароле (timing attack).
    const hash = user?.passwordHash ?? (await AuthService.dummyHash());
    const ok = await verifyPassword(hash, password);

    if (!user || !ok) {
      this.logger.warn(`Неудачная попытка входа для ${normalized}`);
      throw new UnauthorizedException(LOGIN_FAILED);
    }

    const membership = user.memberships[0];
    if (!membership) {
      this.logger.error(`У пользователя ${user.id} нет организации — вход невозможен`);
      throw new UnauthorizedException(LOGIN_FAILED);
    }

    return {
      userId: user.id,
      orgId: membership.orgId,
      email: user.email,
      name: user.name,
      role: membership.role,
    };
  }

  /**
   * Пользователь мог быть удалён или исключён из организации уже после выдачи cookie —
   * поэтому состав сессии подтверждаем из базы на каждом запросе, а не доверяем cookie.
   */
  async resolveSession(userId: string, orgId: string): Promise<SessionUser | null> {
    const membership = await this.prisma.orgMember.findUnique({
      where: { orgId_userId: { orgId, userId } },
      include: { user: true },
    });
    if (!membership) return null;

    return {
      userId: membership.userId,
      orgId: membership.orgId,
      email: membership.user.email,
      name: membership.user.name,
      role: membership.role,
    };
  }

  private static dummyHashCache: string | null = null;

  private static async dummyHash(): Promise<string> {
    if (!AuthService.dummyHashCache) {
      AuthService.dummyHashCache = await hashPassword('несуществующий-пароль-заглушка');
    }
    return AuthService.dummyHashCache;
  }
}
