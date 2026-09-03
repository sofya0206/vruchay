import { createHash, randomBytes } from 'node:crypto';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { LoginOutcome } from '@prisma/client';
import type { FastifyRequest } from 'fastify';
import { PrismaService } from '../prisma/prisma.service';
import type { SessionUser } from './auth.service';

/** Столько же, сколько живёт cookie (main.ts): дольше сессия не нужна никому. */
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

/** Отметку «были только что» пишем не чаще раза в пять минут. */
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

/** Сколько записей журнала входов показываем человеку. */
const LOGIN_HISTORY_LIMIT = 50;

/** Откуда пришли: адрес и браузер, без персональных данных сверх этого. */
export interface ClientMeta {
  ip?: string;
  userAgent?: string;
}

export function clientMeta(req: FastifyRequest): ClientMeta {
  return { ip: req.ip, userAgent: String(req.headers['user-agent'] ?? '').slice(0, 300) };
}

/**
 * Сессии в базе и журнал входов.
 *
 * Cookie по-прежнему шифрованная и содержит только идентификаторы; новое —
 * случайный `sid`, хеш которого лежит в user_sessions. На каждом запросе
 * AuthGuard проверяет, что сессия не завершена, — так «выйти на всех
 * устройствах» работает немедленно, а не через неделю по сроку cookie.
 */
@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Открыть сессию после того, как человек доказал, кто он: паролем
   * (и кодом, если включён второй фактор), ссылкой из письма, приглашением.
   */
  async open(req: FastifyRequest, user: SessionUser, meta: ClientMeta): Promise<void> {
    const sid = randomBytes(32).toString('base64url');
    await this.prisma.userSession.create({
      data: {
        userId: user.userId,
        orgId: user.orgId,
        tokenHash: hashSid(sid),
        ip: meta.ip ?? null,
        userAgent: meta.userAgent ?? '',
      },
    });

    // Подвисшее ожидание кода к этому моменту уже ни к чему. Чистим ключами,
    // а не session.delete(): после delete() библиотека помечает сессию
    // удалённой навсегда и в ответ уходит истёкшая cookie — что бы мы
    // в неё потом ни положили. Вход после этого не открывался вовсе.
    clearSessionKeys(req);
    req.session.set('userId', user.userId);
    req.session.set('orgId', user.orgId);
    req.session.set('sid', sid);
  }

  /** Закрыть свою сессию: и cookie, и запись — иначе cookie можно было бы вернуть. */
  async close(req: FastifyRequest): Promise<void> {
    const sid: unknown = req.session?.get('sid');
    if (typeof sid === 'string') {
      await this.prisma.userSession
        .updateMany({
          where: { tokenHash: hashSid(sid), revokedAt: null },
          data: { revokedAt: new Date() },
        })
        .catch((err: unknown) => this.logger.warn(`Сессия не закрыта в базе: ${String(err)}`));
    }
    req.session.delete();
  }

  /**
   * Жива ли сессия из cookie. Возвращает её идентификатор в базе, чтобы
   * список «активные сессии» мог отметить текущую.
   */
  async resolve(sid: string, userId: string): Promise<{ id: string } | null> {
    const session = await this.prisma.userSession.findUnique({
      where: { tokenHash: hashSid(sid) },
      select: { id: true, userId: true, revokedAt: true, lastSeenAt: true, createdAt: true },
    });
    if (!session || session.userId !== userId || session.revokedAt) return null;
    if (Date.now() - session.createdAt.getTime() > SESSION_TTL_SECONDS * 1000) return null;

    if (Date.now() - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
      // Не ждём: отметка нужна списку сессий, а не этому запросу.
      void this.prisma.userSession
        .update({ where: { id: session.id }, data: { lastSeenAt: new Date() } })
        .catch(() => undefined);
    }
    return { id: session.id };
  }

  /** Активные сессии человека: где он вошёл и когда был в последний раз. */
  async list(userId: string, currentSid: string | undefined) {
    const since = new Date(Date.now() - SESSION_TTL_SECONDS * 1000);
    const sessions = await this.prisma.userSession.findMany({
      where: { userId, revokedAt: null, createdAt: { gt: since } },
      orderBy: { lastSeenAt: 'desc' },
      select: {
        id: true,
        tokenHash: true,
        ip: true,
        userAgent: true,
        createdAt: true,
        lastSeenAt: true,
      },
    });
    const currentHash = currentSid ? hashSid(currentSid) : null;
    return sessions.map((s) => ({
      id: s.id,
      current: s.tokenHash === currentHash,
      ip: s.ip,
      device: describeUserAgent(s.userAgent),
      createdAt: s.createdAt,
      lastSeenAt: s.lastSeenAt,
    }));
  }

  /** Завершить одну сессию — только свою: чужие идентификаторы отвечают 404. */
  async revoke(userId: string, sessionId: string): Promise<void> {
    const result = await this.prisma.userSession.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (result.count === 0) throw new NotFoundException('Сессия не найдена');
  }

  /** Все, кроме текущей: «выйти на остальных устройствах». */
  async revokeOthers(userId: string, currentSid: string | undefined): Promise<number> {
    const result = await this.prisma.userSession.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(currentSid ? { tokenHash: { not: hashSid(currentSid) } } : {}),
      },
      data: { revokedAt: new Date() },
    });
    return result.count;
  }

  /**
   * Все сессии человека без исключения — после смены пароля: если пароль
   * меняют потому, что он утёк, тот, кто его знал, должен вылететь.
   */
  async revokeAll(userId: string, exceptSid?: string): Promise<void> {
    await this.revokeOthers(userId, exceptSid);
  }

  /**
   * Журнал входов. Запись никогда не роняет вход: журнал — свидетельство,
   * а не условие.
   */
  async recordLogin(userId: string, outcome: LoginOutcome, meta: ClientMeta): Promise<void> {
    try {
      await this.prisma.loginEvent.create({
        data: { userId, outcome, ip: meta.ip ?? null, userAgent: meta.userAgent ?? '' },
      });
    } catch (err) {
      this.logger.error(
        `Не записан вход (${outcome}): ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async loginHistory(userId: string) {
    const events = await this.prisma.loginEvent.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: LOGIN_HISTORY_LIMIT,
    });
    return events.map((e) => ({
      id: e.id.toString(),
      outcome: e.outcome,
      ip: e.ip,
      device: describeUserAgent(e.userAgent),
      createdAt: e.createdAt,
    }));
  }
}

/**
 * Стереть содержимое сессии, не помечая её удалённой.
 *
 * Нужно там, где сразу за очисткой пишется новая сессия: session.delete()
 * в этом случае отдал бы браузеру истёкшую cookie и потерял всё, что
 * положили следом.
 */
export function clearSessionKeys(req: FastifyRequest): void {
  for (const key of ['userId', 'orgId', 'sid', 'pendingUserId', 'pendingAt'] as const) {
    req.session.set(key, undefined);
  }
}

function hashSid(sid: string): string {
  return createHash('sha256').update(sid).digest('hex');
}

/**
 * «Chrome, macOS» вместо строки User-Agent целиком: человек ищет в списке
 * своё устройство, а не разбирает версию движка.
 */
export function describeUserAgent(ua: string): string {
  if (!ua) return 'Неизвестное устройство';
  const browser = /YaBrowser\//.test(ua)
    ? 'Яндекс Браузер'
    : /Edg\//.test(ua)
      ? 'Edge'
      : /OPR\//.test(ua)
        ? 'Opera'
        : /Firefox\//.test(ua)
          ? 'Firefox'
          : /Chrome\//.test(ua)
            ? 'Chrome'
            : /Safari\//.test(ua)
              ? 'Safari'
              : 'Браузер';
  const os = /iPhone|iPad/.test(ua)
    ? 'iOS'
    : /Android/.test(ua)
      ? 'Android'
      : /Windows/.test(ua)
        ? 'Windows'
        : /Mac OS X/.test(ua)
          ? 'macOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : '';
  return os ? `${browser}, ${os}` : browser;
}
