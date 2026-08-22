import { describe, expect, it, vi } from 'vitest';
import { TildaMyService } from './tilda-my.service';

/*
 * «Мои документы».
 *
 * Главное, что здесь проверяется: перечень не отдаётся без кода и не
 * выходит за пределы организации и адреса. Остальное — раскладка.
 */

const TOKEN = '11111111-1111-4111-8111-111111111111';

/** Redis в памяти: хеши и срок жизни, больше службе ничего не нужно. */
function fakeRedis() {
  const store = new Map<string, Record<string, string>>();
  const chain = {
    ops: [] as Array<() => void>,
    hset(key: string, values: Record<string, string>) {
      this.ops.push(() => store.set(key, { ...(store.get(key) ?? {}), ...values }));
      return this;
    },
    expire() {
      return this;
    },
    async exec() {
      this.ops.forEach((op) => op());
      this.ops = [];
    },
  };
  return {
    store,
    multi: () => chain,
    hgetall: async (key: string) => store.get(key) ?? {},
    del: async (key: string) => store.delete(key),
  };
}

function service(options: { requests?: Array<Record<string, unknown>>; otp?: string } = {}) {
  const redis = fakeRedis();
  const sendCode = vi.fn();
  const prisma = {
    tildaIntegration: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'integration-1',
        orgId: 'org-1',
        active: true,
        allowedDomains: ['sca-swimming.com'],
      }),
    },
    tildaRequest: {
      findMany: vi.fn().mockResolvedValue(options.requests ?? []),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    document: { findMany: vi.fn().mockResolvedValue([{ id: 'doc-1', title: 'Грамота' }]) },
    file: { findFirst: vi.fn() },
  };
  const otp = {
    issue: vi.fn().mockResolvedValue('123456'),
    verify: vi.fn().mockResolvedValue(options.otp ?? 'ok'),
  };
  const my = new TildaMyService(
    redis as never,
    prisma as never,
    otp as never,
    { sendCode } as never,
    {} as never,
  );
  return { my, prisma, redis, sendCode };
}

const ctx = { origin: 'https://sca-swimming.com' };

describe('мои документы', () => {
  it('просит код и шлёт его на указанную почту', async () => {
    const { my, sendCode } = service();

    const r = await my.start({ token: TOKEN, email: 'anna@example.ru' }, ctx);

    expect(r.status).toBe('need_code');
    expect(sendCode).toHaveBeenCalledWith('org-1', 'anna@example.ru', '123456');
  });

  it('не открывает список без подтверждения', async () => {
    const { my } = service();
    const { listId } = await my.start({ token: TOKEN, email: 'anna@example.ru' }, ctx);

    await expect(my.list(listId)).rejects.toThrow(/не подтверждён/);
  });

  it('после кода отдаёт выданные документы с названиями', async () => {
    const { my } = service({
      requests: [{ id: 'req-1', documentId: 'doc-1', doneAt: new Date('2026-08-01') }],
    });
    const { listId } = await my.start({ token: TOKEN, email: 'anna@example.ru' }, ctx);

    const r = await my.confirm(listId, '123456');

    expect(r.items).toEqual([
      { requestId: 'req-1', title: 'Грамота', issuedAt: '2026-08-01T00:00:00.000Z' },
    ]);
  });

  it('ищет по адресу доставки и по адресу учётной записи, в своей организации', async () => {
    const { my, prisma } = service();
    const { listId } = await my.start(
      { token: TOKEN, email: 'lichniy@example.ru', accountEmail: 'rabochiy@example.ru' },
      ctx,
    );
    await my.confirm(listId, '123456');

    const where = prisma.tildaRequest.findMany.mock.calls[0][0].where;
    expect(where.orgId).toBe('org-1');
    expect(where.status).toBe('done');
    expect(where.OR).toEqual([
      { email: { in: ['lichniy@example.ru', 'rabochiy@example.ru'] } },
      { accountEmail: { in: ['lichniy@example.ru', 'rabochiy@example.ru'] } },
    ]);
  });

  it('отклоняет чужой источник', async () => {
    const { my } = service();

    await expect(
      my.start({ token: TOKEN, email: 'anna@example.ru' }, { origin: 'https://evil.example' }),
    ).rejects.toThrow();
  });

  it('неверный код не открывает список, блокировка его убивает', async () => {
    const wrong = service({ otp: 'wrong' });
    const a = await wrong.my.start({ token: TOKEN, email: 'anna@example.ru' }, ctx);
    await expect(wrong.my.confirm(a.listId, '000000')).rejects.toThrow(/Неверный код/);
    await expect(wrong.my.list(a.listId)).rejects.toThrow(/не подтверждён/);

    const blocked = service({ otp: 'blocked' });
    const b = await blocked.my.start({ token: TOKEN, email: 'anna@example.ru' }, ctx);
    await expect(blocked.my.confirm(b.listId, '000000')).rejects.toThrow(/Слишком много/);
    await expect(blocked.my.list(b.listId)).rejects.toThrow(/не найден/);
  });

  it('скачивание из списка требует подтверждённого сеанса', async () => {
    const { my } = service();
    const { listId } = await my.start({ token: TOKEN, email: 'anna@example.ru' }, ctx);

    await expect(my.download(listId, '22222222-2222-4222-8222-222222222222')).rejects.toThrow();
  });
});
