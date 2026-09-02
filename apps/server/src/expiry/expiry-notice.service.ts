import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { baseUrl, type Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { MailProcessor } from '../mail/mail.processor';
import { isValidEmail } from '../mail/mail-template';
import { verifyUrl } from '../verify/verify-url';
import { expiryNoticeLetter } from './expiry-notice';

export const EXPIRY_QUEUE = 'expiry';

/** Сколько документов разбираем за один заход. */
const BATCH = 200;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Уведомление о скором истечении срока действия.
 *
 * Раз в сутки: находит документы, срок которых выходит в ближайшие
 * EXPIRY_NOTICE_DAYS дней, и ставит каждому участнику одно письмо.
 * «Одно» держится отметкой `expiryNoticeAt` на самом файле, а не журналом
 * писем: журнал чистится по срокам хранения, а отметка обязана пережить
 * и уборку, и перезапуск задачи на следующую ночь.
 *
 * Не шлём тем, кому это бессмысленно: отозванным (документа больше нет),
 * заменённым (действует замена, у неё свой срок), документам материала
 * в корзине и строкам без адреса. Первые три случая молча пропускаются
 * без отметки — вдруг отзыв снимут; строка без адреса помечается, чтобы
 * не перебирать её каждую ночь заново.
 */
@Injectable()
export class ExpiryNoticeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ExpiryNoticeService.name);
  private connection?: IORedis;
  private queue?: Queue;
  private worker?: Worker;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly mailProcessor: MailProcessor,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.config.get('RUN_WORKER', { infer: true })) return;

    this.connection = new IORedis(this.config.get('REDIS_URL', { infer: true }), {
      maxRetriesPerRequest: null,
    });
    this.queue = new Queue(EXPIRY_QUEUE, { connection: this.connection });
    this.worker = new Worker(EXPIRY_QUEUE, () => this.run(), {
      connection: this.connection,
      concurrency: 1,
    });

    // Утром, а не ночью: письмо о сроке человек прочтёт за завтраком,
    // а пришедшее в три часа ночи уйдёт под утренний ворох.
    try {
      await this.queue.upsertJobScheduler(
        'expiry-daily',
        { pattern: '0 15 7 * * *', tz: 'Europe/Moscow' },
        { name: 'notify', opts: { removeOnComplete: 30, removeOnFail: 30 } },
      );
    } catch (err) {
      this.logger.error(
        `Не удалось поставить уведомления о сроке: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
    this.connection?.disconnect();
  }

  /**
   * Один заход. Вынесен отдельно от расписания, чтобы его можно было
   * запустить руками и проверить. Возвращает счёт — без него о молчаливой
   * утренней работе нельзя сказать, шла она вообще или нет.
   */
  async run(now: Date = new Date()): Promise<{ queued: number; skipped: number }> {
    const days = this.config.get('EXPIRY_NOTICE_DAYS', { infer: true });
    if (days <= 0) return { queued: 0, skipped: 0 };

    const publicUrl = baseUrl(this.config.get('PUBLIC_URL', { infer: true }));
    const until = new Date(now.getTime() + days * DAY_MS);
    let queued = 0;
    let skipped = 0;

    // Порциями, пока находится: одна ночь после сезона может принести
    // тысячи истекающих допусков, и держать их все в памяти незачем.
    for (;;) {
      const batch = await this.prisma.file.findMany({
        where: {
          kind: 'generated',
          deletedAt: null,
          s3Key: { not: '' },
          verifyRevoked: false,
          replacedById: null,
          expiryNoticeAt: null,
          expiresAt: { gt: now, lte: until },
          document: { deletedAt: null },
        },
        orderBy: { expiresAt: 'asc' },
        take: BATCH,
        select: {
          id: true,
          orgId: true,
          documentId: true,
          rowId: true,
          publicId: true,
          publicCode: true,
          expiresAt: true,
          row: { select: { data: true } },
          document: { select: { title: true, eventName: true, org: { select: { name: true } } } },
        },
      });
      if (batch.length === 0) break;

      for (const file of batch) {
        const data = (file.row?.data ?? {}) as Record<string, string>;
        const to = (data.email ?? '').trim();

        if (!file.documentId || !file.document || !file.expiresAt || !isValidEmail(to)) {
          // Слать некуда или не о чем — помечаем, чтобы не возвращаться.
          await this.mark(file.id, now);
          skipped++;
          continue;
        }

        try {
          const letter = expiryNoticeLetter({
            title: file.document.title,
            eventName: file.document.eventName,
            orgName: file.document.org.name,
            expiresAt: file.expiresAt,
            verifyUrl: verifyUrl(publicUrl, file),
          });
          const emailId = await this.mail.queueNotice(file.orgId, {
            documentId: file.documentId,
            fileId: file.id,
            rowId: file.rowId,
            toEmail: to,
            subject: letter.subject,
            bodyHtml: letter.bodyHtml,
          });
          await this.mailProcessor.enqueue(emailId);
          await this.mark(file.id, now);
          queued++;
        } catch (err) {
          /*
           * Не настроена отправка, не подтверждён домен, моргнул Redis —
           * помечаем и идём дальше. Без отметки задача возвращалась бы
           * к тому же документу каждое утро с тем же результатом, а с ней
           * человек хотя бы не получит письмо трижды, когда отправку
           * наконец наладят. Причина — в журнале, без адреса участника.
           */
          this.logger.warn(
            `Уведомление о сроке для документа ${file.id} не поставлено: ` +
              `${err instanceof Error ? err.message : String(err)}`,
          );
          await this.mark(file.id, now);
          skipped++;
        }
      }

      if (batch.length < BATCH) break;
    }

    if (queued > 0 || skipped > 0) {
      this.logger.log(`Уведомления о сроке: поставлено ${queued}, пропущено ${skipped}`);
    }
    return { queued, skipped };
  }

  private async mark(fileId: string, at: Date): Promise<void> {
    await this.prisma.file.update({ where: { id: fileId }, data: { expiryNoticeAt: at } });
  }
}
