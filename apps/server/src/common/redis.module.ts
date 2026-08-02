import { Global, Inject, Injectable, Module, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import IORedis from 'ioredis';
import type { Env } from '../config/env';

export const REDIS_CLIENT = 'REDIS_CLIENT';

/**
 * Одно подключение к Redis на процесс.
 *
 * Очереди BullMQ подключаются отдельно — им нужны свои настройки повторов
 * и блокирующие команды, из-за которых соединение нельзя делить с обычными
 * запросами. Всё остальное — коды подтверждения, счётчики частоты —
 * пользуется этим клиентом.
 */
@Injectable()
class RedisConnection implements OnModuleDestroy {
  readonly client: IORedis;

  constructor(config: ConfigService<Env, true>) {
    this.client = new IORedis(config.get('REDIS_URL', { infer: true }), {
      maxRetriesPerRequest: 2,
      // Ошибку лучше получить сразу, чем ждать в очереди на запросе,
      // который всё равно должен ответить человеку за доли секунды.
      enableOfflineQueue: false,
    });
    // Без обработчика ioredis роняет процесс на ошибке подключения.
    this.client.on('error', () => undefined);
  }

  onModuleDestroy(): void {
    this.client.disconnect();
  }
}

@Global()
@Module({
  providers: [
    RedisConnection,
    {
      provide: REDIS_CLIENT,
      useFactory: (connection: RedisConnection) => connection.client,
      inject: [RedisConnection],
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}

/** Короткая обёртка, чтобы не писать @Inject(REDIS_CLIENT) в каждом сервисе. */
export const InjectRedis = () => Inject(REDIS_CLIENT);
