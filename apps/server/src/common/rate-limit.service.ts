import { Injectable, Logger } from '@nestjs/common';
import type IORedis from 'ioredis';
import { InjectRedis } from './redis.module';

export interface RateLimitResult {
  allowed: boolean;
  /** Через сколько секунд окно закроется — это число видит человек в ответе. */
  retryAfterSeconds: number;
}

/**
 * Счётчики обращений в Redis — общие для всех процессов приложения.
 *
 * Пока экземпляр один, разницы с памятью нет; со вторым процессом счётчик
 * в памяти начал бы делить лимит пополам, а на публичных формах он —
 * единственное, что стоит между сервисом и перебором.
 *
 * Если Redis недоступен, запросы не блокируются наглухо: считаем в памяти
 * этого процесса. Ограничение при этом слабее, но сервис остаётся живым,
 * а полное открытие ворот на время сбоя было бы хуже обоих вариантов.
 */
@Injectable()
export class RateLimitService {
  private readonly logger = new Logger(RateLimitService.name);
  private readonly fallback = new Map<string, { count: number; resetAt: number }>();
  private lastCleanup = 0;
  private warned = false;

  constructor(@InjectRedis() private readonly redis: IORedis) {}

  async hit(key: string, windowMs: number, max: number): Promise<RateLimitResult> {
    try {
      // Увеличение и установка срока жизни должны быть неделимы: иначе
      // процесс, упавший между двумя командами, оставит вечный счётчик.
      const [count, ttl] = (await this.redis.eval(
        `local n = redis.call('INCR', KEYS[1])
         if n == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
         return { n, redis.call('PTTL', KEYS[1]) }`,
        1,
        `rl:${key}`,
        String(windowMs),
      )) as [number, number];

      return {
        allowed: count <= max,
        retryAfterSeconds: Math.max(1, Math.ceil((ttl > 0 ? ttl : windowMs) / 1000)),
      };
    } catch (err) {
      if (!this.warned) {
        this.warned = true;
        this.logger.error(
          `Redis недоступен, частота считается в памяти процесса: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
      return this.hitInMemory(key, windowMs, max);
    }
  }

  private hitInMemory(key: string, windowMs: number, max: number): RateLimitResult {
    const now = Date.now();
    this.cleanup(now);

    const hit = this.fallback.get(key);
    if (!hit || hit.resetAt <= now) {
      this.fallback.set(key, { count: 1, resetAt: now + windowMs });
      return { allowed: true, retryAfterSeconds: Math.ceil(windowMs / 1000) };
    }

    hit.count += 1;
    return {
      allowed: hit.count <= max,
      retryAfterSeconds: Math.max(1, Math.ceil((hit.resetAt - now) / 1000)),
    };
  }

  /** Раз в минуту выбрасываем истёкшие окна, чтобы карта не росла бесконечно. */
  private cleanup(now: number): void {
    if (now - this.lastCleanup < 60_000) return;
    this.lastCleanup = now;
    for (const [key, hit] of this.fallback) {
      if (hit.resetAt <= now) this.fallback.delete(key);
    }
  }
}
