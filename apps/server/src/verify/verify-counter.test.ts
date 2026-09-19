import { describe, expect, it, vi } from 'vitest';
import { VerifyCounter, mskDay, shouldCount } from './verify-counter';

/*
 * Счётчик проверок: что не считаем и как отсеиваем повтор.
 *
 * Проверяем не Redis, а правила: свой кабинет и роботы не в счёт,
 * второе открытие за день не уникально, адрес и браузер в базу не попадают.
 */

const file = { id: 'f1', orgId: 'org-1' };

function counterWith(setResults: (string | null)[]) {
  const writes: unknown[] = [];
  const store = new Map<string, string>();
  const redis = {
    set: vi.fn(async (key: string, value: string) => {
      if (key.startsWith('vf:salt:')) {
        if (!store.has(key)) store.set(key, value);
        return 'OK';
      }
      return setResults.shift() ?? null;
    }),
    get: vi.fn(async (key: string) => store.get(key) ?? null),
  };
  const prisma = {
    $transaction: vi.fn(async (ops: unknown[]) => ops),
    file: { update: vi.fn((args: unknown) => args) },
    verifyDaily: {
      upsert: vi.fn((args: unknown) => {
        writes.push(args);
        return args;
      }),
    },
  };
  return { counter: new VerifyCounter(prisma as never, redis as never), writes, redis, prisma };
}

describe('shouldCount', () => {
  it('не считает свой кабинет, роботов, предпросмотры и не-GET', () => {
    expect(shouldCount(file, { sessionOrgId: 'org-1' })).toBe(false);
    expect(shouldCount(file, { userAgent: 'TelegramBot (like TwitterBot)' })).toBe(false);
    expect(shouldCount(file, { userAgent: 'WhatsApp/2.23.20' })).toBe(false);
    expect(shouldCount(file, { userAgent: 'Mozilla/5.0 Chrome/128', method: 'HEAD' })).toBe(false);
  });

  it('считает человека и чужой кабинет', () => {
    expect(shouldCount(file, { userAgent: 'Mozilla/5.0 (iPhone) Safari/605', method: 'GET' })).toBe(
      true,
    );
    expect(shouldCount(file, { sessionOrgId: 'org-2', userAgent: 'Mozilla/5.0' })).toBe(true);
  });
});

describe('VerifyCounter.count', () => {
  it('первое открытие за день уникально, второе — нет', async () => {
    const { counter, writes } = counterWith(['OK', null]);
    const ctx = { ip: '10.0.0.1', userAgent: 'Mozilla/5.0', method: 'GET' };
    const now = new Date('2026-09-20T11:00:00Z');
    expect(await counter.count(file, ctx, now)).toEqual({ counted: true, unique: true });
    expect(await counter.count(file, ctx, now)).toEqual({ counted: true, unique: false });
    const [first, second] = writes as {
      create: { uniques: number; checks: number };
      update: { uniques: { increment: number } };
    }[];
    expect(first.create).toMatchObject({ checks: 1, uniques: 1, fileId: 'f1', orgId: 'org-1' });
    expect(second.update.uniques).toEqual({ increment: 0 });
  });

  it('адрес и браузер не попадают ни в базу, ни в ключи Redis', async () => {
    const { counter, writes, redis } = counterWith(['OK']);
    await counter.count(file, { ip: '203.0.113.7', userAgent: 'Mozilla/5.0 Firefox' });
    expect(JSON.stringify(writes)).not.toMatch(/203\.0\.113\.7|Firefox/);
    for (const call of redis.set.mock.calls)
      expect(String(call[0])).not.toMatch(/203\.0\.113\.7|Firefox/);
  });

  it('без Redis проверка всё равно считается', async () => {
    const { counter, redis } = counterWith([]);
    redis.set.mockRejectedValue(new Error('ECONNREFUSED'));
    expect(await counter.count(file, { ip: '10.0.0.1' })).toEqual({ counted: true, unique: true });
  });
});

describe('mskDay', () => {
  it('границу дня считает по Москве', () => {
    expect(mskDay(new Date('2026-09-20T22:30:00Z'))).toBe('2026-09-21');
    expect(mskDay(new Date('2026-09-20T20:30:00Z'))).toBe('2026-09-20');
  });
});
