import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { THROTTLE_KEY, ThrottleOptions } from './throttle.decorator';

interface Hit {
  count: number;
  resetAt: number;
}

/**
 * Ограничение частоты запросов со скользящим окном.
 *
 * Счётчики держатся в памяти процесса — этого достаточно, пока приложение
 * работает в одном экземпляре (наша конфигурация: один prod-сервер).
 * При переходе на несколько экземпляров хранилище нужно заменить на Redis,
 * иначе лимит будет умножаться на число процессов.
 */
@Injectable()
export class ThrottleGuard implements CanActivate {
  private readonly hits = new Map<string, Hit>();
  private lastCleanup = 0;

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const options = this.reflector.get<ThrottleOptions | undefined>(
      THROTTLE_KEY,
      context.getHandler(),
    );
    if (!options) return true;

    const req = context.switchToHttp().getRequest<FastifyRequest>();
    const now = Date.now();
    this.cleanup(now);

    const key = `${context.getClass().name}.${context.getHandler().name}:${req.ip}`;
    const windowMs = parseWindow(options.timeWindow);
    const hit = this.hits.get(key);

    if (!hit || hit.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }

    hit.count += 1;
    if (hit.count > options.max) {
      const retryAfter = Math.ceil((hit.resetAt - now) / 1000);
      throw new HttpException(
        { message: `Слишком много попыток. Повторите через ${retryAfter} с.` },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }

  /** Раз в минуту выбрасываем истёкшие окна, чтобы карта не росла бесконечно. */
  private cleanup(now: number): void {
    if (now - this.lastCleanup < 60_000) return;
    this.lastCleanup = now;
    for (const [key, hit] of this.hits) {
      if (hit.resetAt <= now) this.hits.delete(key);
    }
  }
}

const UNITS: Record<string, number> = {
  second: 1000,
  seconds: 1000,
  minute: 60_000,
  minutes: 60_000,
  hour: 3_600_000,
  hours: 3_600_000,
};

export function parseWindow(spec: string): number {
  const match = /^(\d+)\s*(second|seconds|minute|minutes|hour|hours)$/.exec(spec.trim());
  if (!match) throw new Error(`Некорректное окно ограничения: "${spec}"`);
  return Number(match[1]) * UNITS[match[2]];
}
