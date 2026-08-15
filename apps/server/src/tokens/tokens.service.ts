import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import type { SessionUser } from '../auth/auth.service';

/**
 * Приставка у всех наших токенов.
 *
 * Нужна не для красоты: сервисы поиска утечек (GitHub, GitLab) находят
 * секреты по узнаваемому началу строки. Токен без приставки в чужом
 * репозитории не отличить от случайного набора букв, и никто о нём
 * не предупредит.
 */
const PREFIX = 'vru_';
/** 32 случайных байта. Перебирать нечем — и это единственная защита токена. */
const SECRET_BYTES = 32;

export interface CreatedToken {
  id: string;
  name: string;
  /** Полный токен. Показывается один раз и больше нигде не хранится. */
  token: string;
}

@Injectable()
export class TokensService {
  constructor(private readonly prisma: PrismaService) {}

  async list(orgId: string) {
    const tokens = await this.prisma.apiToken.findMany({
      where: { orgId, revokedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    return tokens.map((t) => ({
      id: t.id,
      name: t.name,
      // Показываем только начало: по нему владелец узнаёт свой токен
      // среди нескольких, а воспользоваться им нельзя.
      prefix: t.prefix,
      role: t.role,
      createdAt: t.createdAt,
      lastUsedAt: t.lastUsedAt,
    }));
  }

  async create(params: {
    orgId: string;
    userId: string;
    name: string;
    role: 'member' | 'admin';
  }): Promise<CreatedToken> {
    const count = await this.prisma.apiToken.count({
      where: { orgId: params.orgId, revokedAt: null },
    });
    // Потолок от накопления забытых токенов: каждый действующий — это
    // ещё один ключ от организации, и десяти хватает с запасом.
    if (count >= 10) {
      throw new BadRequestException(
        'Больше десяти действующих токенов не бывает. Отзовите ненужные.',
      );
    }

    const secret = randomBytes(SECRET_BYTES).toString('base64url');
    const token = PREFIX + secret;

    const created = await this.prisma.apiToken.create({
      data: {
        orgId: params.orgId,
        name: params.name,
        tokenHash: hashToken(token),
        prefix: token.slice(0, PREFIX.length + 6),
        role: params.role,
        createdByUserId: params.userId,
      },
    });

    return { id: created.id, name: created.name, token };
  }

  async revoke(orgId: string, id: string) {
    const token = await this.prisma.apiToken.findFirst({
      where: { id, orgId, revokedAt: null },
    });
    if (!token) throw new NotFoundException('Токен не найден');

    // Помечаем отозванным, а не удаляем: запись нужна, чтобы потом
    // ответить на вопрос «кто и когда завёл этот доступ».
    await this.prisma.apiToken.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
    return { ok: true as const, name: token.name };
  }

  /**
   * Проверяет токен из заголовка и отдаёт то же, что сессия человека.
   *
   * Отдаём именно SessionUser, потому что дальше приложение не должно
   * различать, кто пришёл: правила доступа к чужим материалам одни и те
   * же и не зависят от способа входа. Отличие ровно одно — пометка
   * viaToken, по которой закрыты действия над людьми.
   */
  async resolve(authorization: string | undefined): Promise<SessionUser | null> {
    const token = bearer(authorization);
    if (!token) return null;

    const found = await this.prisma.apiToken.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { org: { select: { name: true } } },
    });
    if (!found || found.revokedAt) return null;

    // Отметку о последнем использовании не ждём: она нужна человеку,
    // чтобы найти забытые токены, и запрос из-за неё тормозить не должен.
    void this.touch(found.id, found.lastUsedAt);

    return {
      userId: found.createdByUserId ?? '',
      orgId: found.orgId,
      email: '',
      name: `Токен «${found.name}»`,
      role: found.role,
      viaToken: true,
    };
  }

  /**
   * Отметка «пользовались» пишется не чаще раза в час.
   *
   * Точное время последнего запроса никому не нужно, а запись при каждом
   * обращении превратила бы выгрузку тысячи документов в тысячу лишних
   * записей в ту же строку.
   */
  private async touch(id: string, lastUsedAt: Date | null): Promise<void> {
    const hour = 60 * 60 * 1000;
    if (lastUsedAt && Date.now() - lastUsedAt.getTime() < hour) return;
    try {
      await this.prisma.apiToken.update({ where: { id }, data: { lastUsedAt: new Date() } });
    } catch {
      /* отметка не стоит того, чтобы ронять запрос */
    }
  }
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Достаёт токен из «Authorization: Bearer vru_…». */
function bearer(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  const value = match?.[1];
  if (!value || !value.startsWith(PREFIX)) return null;
  return value;
}
