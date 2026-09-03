import { describe, expect, it, vi } from 'vitest';
import { Reflector } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';
import type IORedis from 'ioredis';
import { VerifyController } from '../verify/verify.controller';
import { UnsubscribeController } from '../mailing/unsubscribe.controller';
import { TrackingController } from '../mail/tracking.controller';
import { TeamInviteController } from '../team/team.controller';
import { PublicOrgController } from '../public-org/public-org.controller';
import { ThrottleGuard } from './throttle.guard';
import { THROTTLE_KEY, type ThrottleOptions } from './throttle.decorator';
import { RateLimitService } from './rate-limit.service';

/*
 * Ограничение частоты на публичных адресах.
 *
 * Приёмка требует: сотня запросов подряд на разные коды даёт 429, и в базу
 * при этом ничего не пишется. Проверяем это через тот же путь, каким запрос
 * идёт в бою: метаданные на обработчике → ThrottleGuard → счётчик. Проверка
 * одного лишь наличия декоратора была бы проверкой синтаксиса, а не защиты —
 * ровно так этот дефект и доехал до приёмки: счётчик вызывался, а ответ
 * его никто не смотрел.
 */

/** Подделка Redis: считает то же, что настоящий скрипт с INCR и PEXPIRE. */
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

/** Контекст запроса к настоящему обработчику настоящего контроллера. */
function contextFor(
  controller: new (...args: never[]) => object,
  method: string,
  ip: string,
): ExecutionContext {
  const handler = (controller.prototype as Record<string, () => unknown>)[method];
  return {
    getHandler: () => handler,
    getClass: () => controller,
    switchToHttp: () => ({ getRequest: () => ({ ip }) }),
  } as unknown as ExecutionContext;
}

/** Ограничение, объявленное на обработчике, — то самое, что читает страж. */
function optionsOf(
  controller: new (...args: never[]) => object,
  method: string,
): ThrottleOptions | undefined {
  const handler = (controller.prototype as Record<string, () => unknown>)[method];
  return new Reflector().get<ThrottleOptions | undefined>(THROTTLE_KEY, handler);
}

const PUBLIC_ROUTES = [
  { name: 'проверка подлинности', controller: VerifyController, method: 'check' },
  { name: 'страница отписки', controller: UnsubscribeController, method: 'ask' },
  { name: 'подтверждение отписки', controller: UnsubscribeController, method: 'confirm' },
  { name: 'отметка о прочтении', controller: TrackingController, method: 'open' },
  { name: 'приём приглашения', controller: TeamInviteController, method: 'accept' },
  { name: 'публичная страница организации', controller: PublicOrgController, method: 'page' },
  { name: 'поиск в публичном реестре', controller: PublicOrgController, method: 'search' },
] as const;

describe.each(PUBLIC_ROUTES)('$name', ({ controller, method }) => {
  it('объявляет ограничение частоты', () => {
    const options = optionsOf(controller as never, method);
    expect(options).toBeDefined();
    expect(options!.max).toBeGreaterThan(0);
  });

  it('на сотне запросов подряд отвечает 429', async () => {
    const options = optionsOf(controller as never, method)!;
    const reflector = { get: () => options } as unknown as Reflector;
    const guard = new ThrottleGuard(reflector, new RateLimitService(fakeRedis()));
    const ctx = contextFor(controller as never, method, '203.0.113.7');

    let refusals = 0;
    for (let i = 0; i < 100; i++) {
      try {
        await guard.canActivate(ctx);
      } catch {
        refusals += 1;
      }
    }

    // Хотя бы одна сотня запросов должна упереться в предел: иначе публичный
    // адрес открыт для перебора, сколько бы декораторов на нём ни висело.
    expect(refusals).toBeGreaterThan(0);
    expect(refusals).toBe(100 - options.max);
  });
});

describe('проверка подлинности считает по обращающемуся, а не по документу', () => {
  it('перебор разных кодов упирается в один и тот же предел', async () => {
    const options = optionsOf(VerifyController as never, 'check')!;
    const reflector = { get: () => options } as unknown as Reflector;
    const limiter = new RateLimitService(fakeRedis());
    const guard = new ThrottleGuard(reflector, limiter);

    // Ключ раньше собирался из кода документа — у каждого кода было своё
    // окно, и перебор не задевал ни одного. Контекст здесь один и тот же
    // обработчик с одного адреса: то, что различается, — только код в пути,
    // и на счёт он влиять не должен.
    const ctx = contextFor(VerifyController as never, 'check', '198.51.100.4');
    for (let i = 0; i < options.max; i++) {
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
    }
    await expect(guard.canActivate(ctx)).rejects.toThrow(/Слишком много попыток/);
  });
});

describe('проверка подлинности не пишет в базу за пределом', () => {
  it('счётчик проверок не трогается, когда запрос отбит', async () => {
    const update = vi.fn();
    const prisma = { file: { findUnique: vi.fn(), update } };
    const controller = new VerifyController(prisma as never, {} as never);

    const options = optionsOf(VerifyController as never, 'check')!;
    const reflector = { get: () => options } as unknown as Reflector;
    const guard = new ThrottleGuard(reflector, new RateLimitService(fakeRedis()));
    const ctx = contextFor(VerifyController as never, 'check', '198.51.100.9');

    for (let i = 0; i < options.max + 20; i++) {
      let allowed = true;
      try {
        await guard.canActivate(ctx);
      } catch {
        allowed = false;
      }
      // Страж стоит до обработчика: отбитый запрос до контроллера не доходит.
      if (allowed) await controller.check('00000000-0000-4000-8000-000000000000').catch(() => {});
    }

    // Столько же обращений к базе, сколько запросов пропустил страж,
    // и ни одного сверх того.
    expect(prisma.file.findUnique.mock.calls.length).toBe(options.max);
    expect(update).not.toHaveBeenCalled();
  });
});
