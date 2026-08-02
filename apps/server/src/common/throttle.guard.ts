import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { THROTTLE_KEY, ThrottleOptions } from './throttle.decorator';
import { RateLimitService } from './rate-limit.service';

/**
 * Ограничение частоты обращений к помеченным маршрутам.
 *
 * Ключ — маршрут плюс адрес обращения: лимит на вход не должен расходоваться
 * заявками с формы и наоборот. Счётчики общие для всех процессов приложения,
 * см. RateLimitService.
 */
@Injectable()
export class ThrottleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly limiter: RateLimitService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = this.reflector.get<ThrottleOptions | undefined>(
      THROTTLE_KEY,
      context.getHandler(),
    );
    if (!options) return true;

    const req = context.switchToHttp().getRequest<FastifyRequest>();
    const key = `${context.getClass().name}.${context.getHandler().name}:${req.ip}`;
    const result = await this.limiter.hit(key, parseWindow(options.timeWindow), options.max);

    if (!result.allowed) {
      throw new HttpException(
        { message: `Слишком много попыток. Повторите через ${result.retryAfterSeconds} с.` },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
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
