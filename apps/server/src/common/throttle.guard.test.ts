import { describe, expect, it, vi } from 'vitest';
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ThrottleGuard, parseWindow } from './throttle.guard';
import { ThrottleOptions } from './throttle.decorator';

function contextFor(ip: string): ExecutionContext {
  const handler = function login() {};
  return {
    getHandler: () => handler,
    getClass: () => class AuthController {},
    switchToHttp: () => ({ getRequest: () => ({ ip }) }),
  } as unknown as ExecutionContext;
}

function guardWith(options: ThrottleOptions | undefined): ThrottleGuard {
  const reflector = { get: vi.fn().mockReturnValue(options) } as unknown as Reflector;
  return new ThrottleGuard(reflector);
}

describe('ThrottleGuard', () => {
  it('пропускает маршруты без ограничения', () => {
    const guard = guardWith(undefined);
    for (let i = 0; i < 100; i++) expect(guard.canActivate(contextFor('1.1.1.1'))).toBe(true);
  });

  it('блокирует после превышения лимита', () => {
    const guard = guardWith({ max: 3, timeWindow: '5 minutes' });
    const ctx = contextFor('2.2.2.2');
    expect(guard.canActivate(ctx)).toBe(true);
    expect(guard.canActivate(ctx)).toBe(true);
    expect(guard.canActivate(ctx)).toBe(true);
    expect(() => guard.canActivate(ctx)).toThrow(/Слишком много попыток/);
  });

  it('считает лимиты по каждому адресу отдельно', () => {
    const guard = guardWith({ max: 1, timeWindow: '5 minutes' });
    expect(guard.canActivate(contextFor('3.3.3.3'))).toBe(true);
    expect(guard.canActivate(contextFor('4.4.4.4'))).toBe(true);
    expect(() => guard.canActivate(contextFor('3.3.3.3'))).toThrow();
  });

  it('снимает блокировку после окончания окна', () => {
    vi.useFakeTimers();
    try {
      const guard = guardWith({ max: 1, timeWindow: '1 minute' });
      const ctx = contextFor('5.5.5.5');
      expect(guard.canActivate(ctx)).toBe(true);
      expect(() => guard.canActivate(ctx)).toThrow();
      vi.advanceTimersByTime(61_000);
      expect(guard.canActivate(ctx)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
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
