import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import type { Env } from '../config/env';

export const RETENTION_QUEUE = 'retention';

/**
 * Сроки хранения данных, собранных публичными формами.
 *
 * Закон разрешает хранить персональные данные не дольше, чем этого требует
 * цель их сбора (ч. 7 ст. 5 152-ФЗ). Цели здесь разные, поэтому и сроки разные:
 *
 * - адрес обращения, отпечаток браузера и поля формы нужны только для разбора
 *   злоупотреблений в момент выдачи — через 90 дней стираются;
 * - почтовый адрес остаётся дольше: по нему участник может запросить свой
 *   документ повторно, и по нему же работает правило «один документ на адрес»;
 * - незавершённые заявки не привели к выдаче — хранить в них нечего,
 *   удаляются целиком через 30 дней;
 * - согласия живут три года: столько же длится общий срок исковой давности,
 *   а именно в споре они и понадобятся. Адрес обращения в согласии, в отличие
 *   от заявки, стирать нельзя — он часть доказательства, а не служебный след.
 */
const ANONYMIZE_AFTER_DAYS = 90;
const DROP_UNFINISHED_AFTER_DAYS = 30;
const DROP_REQUESTS_AFTER_DAYS = 365;
const DROP_CONSENTS_AFTER_DAYS = 3 * 365;

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class RetentionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RetentionService.name);
  private connection?: IORedis;
  private queue?: Queue;
  private worker?: Worker;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.config.get('RUN_WORKER', { infer: true })) return;

    this.connection = new IORedis(this.config.get('REDIS_URL', { infer: true }), {
      maxRetriesPerRequest: null,
    });
    this.queue = new Queue(RETENTION_QUEUE, { connection: this.connection });
    this.worker = new Worker(RETENTION_QUEUE, () => this.run(), {
      connection: this.connection,
      concurrency: 1,
    });

    // Раз в сутки ночью. Расписание живёт в Redis и не размножается при
    // перезапуске: одинаковое имя заменяет прежнее, а не добавляет второе.
    try {
      await this.queue.upsertJobScheduler(
        'retention-daily',
        { pattern: '0 30 3 * * *' },
        { name: 'clean', opts: { removeOnComplete: 30, removeOnFail: 30 } },
      );
    } catch (err) {
      // Недоступный при старте Redis не должен мешать приложению подняться:
      // расписание восстановится при следующем запуске.
      this.logger.error(
        `Не удалось поставить ночную очистку: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
    this.connection?.disconnect();
  }

  /** Вынесено отдельно от расписания, чтобы можно было запустить руками. */
  async run(): Promise<{ anonymized: number; unfinished: number; requests: number; consents: number }> {
    const now = Date.now();
    const before = (days: number) => new Date(now - days * DAY_MS);

    const anonymized = await this.prisma.tildaRequest.updateMany({
      where: {
        createdAt: { lt: before(ANONYMIZE_AFTER_DAYS) },
        // Уже обезличенные заявки повторно не трогаем: иначе счётчик
        // в журнале каждую ночь показывал бы одно и то же число.
        NOT: { ip: null, userAgent: null },
      },
      data: { ip: null, userAgent: null, fields: {} },
    });

    const unfinished = await this.prisma.tildaRequest.deleteMany({
      where: {
        status: { in: ['pending_otp', 'rejected', 'failed'] },
        createdAt: { lt: before(DROP_UNFINISHED_AFTER_DAYS) },
      },
    });

    const requests = await this.prisma.tildaRequest.deleteMany({
      where: { createdAt: { lt: before(DROP_REQUESTS_AFTER_DAYS) } },
    });

    const consents = await this.prisma.consent.deleteMany({
      where: { createdAt: { lt: before(DROP_CONSENTS_AFTER_DAYS) } },
    });

    const result = {
      anonymized: anonymized.count,
      unfinished: unfinished.count,
      requests: requests.count,
      consents: consents.count,
    };
    if (Object.values(result).some((n) => n > 0)) {
      this.logger.log(
        `Сроки хранения: обезличено ${result.anonymized}, удалено незавершённых ` +
          `${result.unfinished}, заявок ${result.requests}, согласий ${result.consents}`,
      );
    }
    return result;
  }
}
