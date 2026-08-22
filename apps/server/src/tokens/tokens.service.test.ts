import { describe, expect, it } from 'vitest';
import { TokensService } from './tokens.service';

/*
 * Токены API. Проверяем ровно то, от чего зависит доступ к чужой
 * организации: какой заголовок принимается, какой отвергается, и что
 * в базу не попадает сам токен.
 */

function serviceWith(stored: Record<string, unknown> | null) {
  const updates: unknown[] = [];
  const created: Record<string, unknown>[] = [];
  const prisma = {
    apiToken: {
      findUnique: async () => stored,
      findFirst: async () => stored,
      findMany: async () => [],
      count: async () => 0,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        created.push(data);
        return { ...data, id: 'new-id' };
      },
      update: async (args: unknown) => {
        updates.push(args);
        return {};
      },
    },
  };
  return { svc: new TokensService(prisma as never), updates, created };
}

const validToken = {
  id: 't1',
  orgId: 'org-1',
  name: 'бот федерации',
  role: 'member',
  createdByUserId: 'u1',
  revokedAt: null,
  lastUsedAt: null,
};

describe('проверка заголовка', () => {
  it('принимает свой токен', async () => {
    const { svc } = serviceWith(validToken);
    const user = await svc.resolve('Bearer vru_abcdefghijklmnop');
    expect(user?.orgId).toBe('org-1');
    expect(user?.viaToken).toBe(true);
  });

  it('без заголовка — никто', async () => {
    const { svc } = serviceWith(validToken);
    await expect(svc.resolve(undefined)).resolves.toBeNull();
  });

  it('чужой формат не принимаем, не заглядывая в базу', async () => {
    // Basic-заголовок и токен без нашей приставки не должны приводить
    // даже к запросу: иначе каждый мимо проходящий запрос стучится в базу.
    const { svc } = serviceWith(validToken);
    await expect(svc.resolve('Basic dXNlcjpwYXNz')).resolves.toBeNull();
    await expect(svc.resolve('Bearer ghp_notours')).resolves.toBeNull();
    await expect(svc.resolve('vru_bez_bearer')).resolves.toBeNull();
  });

  it('отозванный токен больше не работает', async () => {
    const { svc } = serviceWith({ ...validToken, revokedAt: new Date() });
    await expect(svc.resolve('Bearer vru_abcdefghijklmnop')).resolves.toBeNull();
  });

  it('несуществующий токен — никто', async () => {
    const { svc } = serviceWith(null);
    await expect(svc.resolve('Bearer vru_abcdefghijklmnop')).resolves.toBeNull();
  });
});

describe('выдача', () => {
  it('в базу кладётся хеш, а не токен', async () => {
    const { svc, created } = serviceWith(null);
    const result = await svc.create({
      orgId: 'org-1',
      userId: 'u1',
      name: 'выгрузка',
      role: 'member',
    });

    expect(result.token).toMatch(/^vru_[A-Za-z0-9_-]{40,}$/);
    const saved = created[0];
    expect(saved.tokenHash).not.toContain(result.token);
    expect(String(saved.tokenHash)).toMatch(/^[a-f0-9]{64}$/);
    // Приставка — видимая часть, по ней владелец узнаёт свой токен.
    expect(result.token.startsWith(String(saved.prefix))).toBe(true);
  });

  it('каждый токен свой', async () => {
    const { svc } = serviceWith(null);
    const a = await svc.create({ orgId: 'o', userId: 'u', name: 'a', role: 'member' });
    const b = await svc.create({ orgId: 'o', userId: 'u', name: 'b', role: 'member' });
    expect(a.token).not.toBe(b.token);
  });
});

describe('отметка о последнем использовании', () => {
  it('не пишется чаще раза в час', async () => {
    // Выгрузка тысячи документов не должна порождать тысячу записей
    // в одну и ту же строку.
    const { svc, updates } = serviceWith({ ...validToken, lastUsedAt: new Date() });
    await svc.resolve('Bearer vru_abcdefghijklmnop');
    await new Promise((r) => setTimeout(r, 10));
    expect(updates).toHaveLength(0);
  });

  it('пишется, если давно не пользовались', async () => {
    const old = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const { svc, updates } = serviceWith({ ...validToken, lastUsedAt: old });
    await svc.resolve('Bearer vru_abcdefghijklmnop');
    await new Promise((r) => setTimeout(r, 10));
    expect(updates).toHaveLength(1);
  });
});

describe('отзыв', () => {
  it('помечает, а не удаляет — запись нужна для разбора', async () => {
    const { svc, updates } = serviceWith(validToken);
    await svc.revoke('org-1', 't1');
    expect(updates).toHaveLength(1);
    expect((updates[0] as { data: { revokedAt: Date } }).data.revokedAt).toBeInstanceOf(Date);
  });

  it('чужой токен не находится', async () => {
    const { svc } = serviceWith(null);
    await expect(svc.revoke('org-1', 'foreign')).rejects.toThrow('не найден');
  });
});

describe('потолок', () => {
  it('одиннадцатый токен не выдаётся', async () => {
    const prisma = {
      apiToken: { count: async () => 10, create: async () => ({}) },
    };
    const svc = new TokensService(prisma as never);
    await expect(
      svc.create({ orgId: 'o', userId: 'u', name: 'ещё один', role: 'member' }),
    ).rejects.toThrow('десяти');
  });
});
