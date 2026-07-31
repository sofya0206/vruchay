import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { MailService } from './mail.service';
import type { Env } from '../config/env';

export const MAIL_QUEUE = 'mail';

/**
 * Отправка писем очередью.
 *
 * Ограничение частоты обязательно: массовая рассылка «в лоб» выглядит
 * для принимающей стороны как спам-волна и портит репутацию домена,
 * с которой потом трудно что-то сделать. Пять писем в секунду —
 * безопасный темп, при 1000 писем это чуть больше трёх минут.
 */
@Injectable()
export class MailProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MailProcessor.name);
  private connection?: IORedis;
  private queue?: Queue<{ emailId: string }>;
  private worker?: Worker<{ emailId: string }>;

  constructor(
    private readonly mail: MailService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  onModuleInit(): void {
    this.connection = new IORedis(this.config.get('REDIS_URL', { infer: true }), {
      maxRetriesPerRequest: null,
    });
    this.queue = new Queue(MAIL_QUEUE, { connection: this.connection });

    if (!this.config.get('RUN_WORKER', { infer: true })) return;

    this.worker = new Worker<{ emailId: string }>(
      MAIL_QUEUE,
      (job) => this.mail.sendOne(job.data.emailId),
      {
        connection: this.connection,
        concurrency: 3,
        limiter: { max: 5, duration: 1000 },
      },
    );
    this.worker.on('failed', (job, err) => {
      this.logger.error(`Письмо ${job?.data.emailId}: ${err.message}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
    this.connection?.disconnect();
  }

  async enqueue(emailId: string): Promise<void> {
    await this.queue?.add(
      'send',
      { emailId },
      {
        // Временная недоступность почтового шлюза не должна терять письмо.
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 200,
        removeOnFail: 500,
      },
    );
  }
}
