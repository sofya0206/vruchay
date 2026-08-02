import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type IORedis from 'ioredis';
import { InjectRedis } from '../common/redis.module';

/**
 * Одноразовые коды подтверждения адреса.
 *
 * Это главная защита публичной формы от злоупотребления: без подтверждения
 * любой смог бы заказывать документы на чужие адреса и рассылать их от имени
 * федерации. Код живёт в Redis, а не в базе, — он временный и переживать
 * перезапуск не должен.
 *
 * Сам код не хранится: только его хеш. Утечка дампа Redis не должна давать
 * возможность подтвердить чужую заявку.
 */

const TTL_SECONDS = 10 * 60;
const MAX_ATTEMPTS = 5;

@Injectable()
export class OtpService {
  constructor(@InjectRedis() private readonly redis: IORedis) {}

  private key(requestId: string): string {
    return `otp:${requestId}`;
  }

  private static hash(code: string): string {
    return createHash('sha256').update(code).digest('hex');
  }

  /** Возвращает код для отправки на почту; в хранилище остаётся только хеш. */
  async issue(requestId: string): Promise<string> {
    // randomInt из crypto, а не Math.random: код должен быть непредсказуем.
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.redis
      .multi()
      .hset(this.key(requestId), { hash: OtpService.hash(code), attempts: '0' })
      .expire(this.key(requestId), TTL_SECONDS)
      .exec();
    return code;
  }

  /**
   * Проверка кода. Возвращает причину отказа, а не просто false:
   * пользователю нужно понимать, истёк код или он ошибся.
   */
  async verify(requestId: string, code: string): Promise<'ok' | 'expired' | 'wrong' | 'blocked'> {
    const key = this.key(requestId);
    const stored = await this.redis.hgetall(key);
    if (!stored.hash) return 'expired';

    const attempts = Number(stored.attempts ?? 0);
    if (attempts >= MAX_ATTEMPTS) {
      await this.redis.del(key);
      return 'blocked';
    }

    const expected = Buffer.from(stored.hash, 'hex');
    const received = Buffer.from(OtpService.hash(code.trim()), 'hex');
    const match =
      expected.length === received.length &&
      timingSafeEqual(new Uint8Array(expected), new Uint8Array(received));

    if (!match) {
      const next = await this.redis.hincrby(key, 'attempts', 1);
      return next >= MAX_ATTEMPTS ? 'blocked' : 'wrong';
    }

    // Код одноразовый: повторно подтвердить ту же заявку нельзя.
    await this.redis.del(key);
    return 'ok';
  }
}
