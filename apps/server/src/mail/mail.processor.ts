import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { MailService } from './mail.service';
import type { Env } from '../config/env';

export const MAIL_QUEUE = 'mail';

/**
 * Сколько раз очередь пробует отправить письмо и с какой начальной паузой.
 *
 * Пять попыток с удвоением от пятнадцати секунд — это 15, 30, 60 и 120
 * секунд ожидания, то есть почти четыре минуты. Столько и должно быть:
 * почтовый шлюз перезапускают дольше, чем за секунды, а трёх попыток
 * подряд хватало ровно на четверть минуты — рассылка успевала целиком
 * пометиться «не доставлено» из-за перезапуска соседнего сервиса.
 */
export const MAIL_ATTEMPTS = 5;
export const MAIL_BACKOFF_MS = 15_000;

/**
 * Последняя ли это попытка — повторять после неё очередь уже не будет.
 *
 * Считаем по `attemptsStarted`: BullMQ увеличивает его в момент, когда
 * задание уходит в работу, поэтому на первом заходе он равен единице.
 * У `attemptsMade` смысл другой — сколько попыток уже провалилось, — и
 * на первом заходе он ноль; перепутать их значит либо не повторять вовсе,
 * либо оставить письмо навсегда «в очереди» после последнего провала.
 */
export function isLastAttempt(job: {
  attemptsStarted?: number;
  opts?: { attempts?: number };
}): boolean {
  return (job.attemptsStarted ?? 1) >= (job.opts?.attempts ?? 1);
}

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
      (job) => this.mail.sendOne(job.data.emailId, isLastAttempt(job)),
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
        attempts: MAIL_ATTEMPTS,
        backoff: { type: 'exponential', delay: MAIL_BACKOFF_MS },
        removeOnComplete: 200,
        removeOnFail: 500,
      },
    );
  }
}
