import { beforeAll, describe, expect, it, vi } from 'vitest';
import { ExecutionContext, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type IORedis from 'ioredis';
import { ThrottleGuard, parseWindow } from './throttle.guard';
import { ThrottleOptions } from './throttle.decorator';
import { RateLimitService } from './rate-limit.service';

// Проверка недоступного Redis намеренно вызывает запись об ошибке. В выводе
// тестов ей не место: красная строка про сбой там, где всё идёт по плану,
// приучает не смотреть на такие строки вообще.
beforeAll(() => {
  vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
});

function contextFor(ip: string): ExecutionContext {
  const handler = function login() {};
  return {
    getHandler: () => handler,
    getClass: () => class AuthController {},
    switchToHttp: () => ({ getRequest: () => ({ ip }) }),
  } as unknown as ExecutionContext;
}

/** Подделка Redis: считает ровно то же, что настоящий скрипт с INCR и PEXPIRE. */
function fakeRedis(): IORedis {
  const store = new Map<string, { count: number; resetAt: number }>();
  return {
    eval: (_script: string, _keys: number, key: string, windowMs: string) => {
      const now = Date.now();
      const entry = store.get(key);
      if (!entry || entry.resetAt <= now) {
        store.set(key, { count: 1, resetAt: now + Number(windowMs) });
        return Promise.resolve([1, Number(windowMs)]);
      }
      entry.count += 1;
      return Promise.resolve([entry.count, entry.resetAt - now]);
    },
  } as unknown as IORedis;
}

/** Недоступный Redis: каждый вызов падает, счёт должен уйти в память процесса. */
function brokenRedis(): IORedis {
  return { eval: () => Promise.reject(new Error('ECONNREFUSED')) } as unknown as IORedis;
}

function guardWith(options: ThrottleOptions | undefined, redis: IORedis = fakeRedis()): ThrottleGuard {
  const reflector = { get: vi.fn().mockReturnValue(options) } as unknown as Reflector;
  return new ThrottleGuard(reflector, new RateLimitService(redis));
}

describe('ThrottleGuard', () => {
  it('пропускает маршруты без ограничения', async () => {
    const guard = guardWith(undefined);
    for (let i = 0; i < 100; i++) {
      await expect(guard.canActivate(contextFor('1.1.1.1'))).resolves.toBe(true);
    }
  });

  it('блокирует после превышения лимита', async () => {
    const guard = guardWith({ max: 3, timeWindow: '5 minutes' });
    const ctx = contextFor('2.2.2.2');
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    await expect(guard.canActivate(ctx)).rejects.toThrow(/Слишком много попыток/);
  });

  it('считает лимиты по каждому адресу отдельно', async () => {
    const guard = guardWith({ max: 1, timeWindow: '5 minutes' });
    await expect(guard.canActivate(contextFor('3.3.3.3'))).resolves.toBe(true);
    await expect(guard.canActivate(contextFor('4.4.4.4'))).resolves.toBe(true);
    await expect(guard.canActivate(contextFor('3.3.3.3'))).rejects.toThrow();
  });

  it('снимает блокировку после окончания окна', async () => {
    vi.useFakeTimers();
    try {
      const guard = guardWith({ max: 1, timeWindow: '1 minute' });
      const ctx = contextFor('5.5.5.5');
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
      await expect(guard.canActivate(ctx)).rejects.toThrow();
      vi.advanceTimersByTime(61_000);
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('продолжает ограничивать, когда Redis недоступен', async () => {
    const guard = guardWith({ max: 2, timeWindow: '5 minutes' }, brokenRedis());
    const ctx = contextFor('6.6.6.6');
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    await expect(guard.canActivate(ctx)).rejects.toThrow(/Слишком много попыток/);
  });
});

describe('parseWindow', () => {
  it('разбирает поддерживаемые единицы', () => {
    expect(parseWindow('30 seconds')).toBe(30_000);
    expect(parseWindow('5 minutes')).toBe(300_000);
    expect(parseWindow('1 hour')).toBe(3_600_000);
  });

  it('отклоняет мусор', () => {
    expect(() => parseWindow('быстро')).toThrow();
  });
});
