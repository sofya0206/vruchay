import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { TRASH_DAYS } from '@gramota/shared';
import { PrismaService } from '../prisma/prisma.service';
import { DocumentsService } from '../documents/documents.service';
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
 *
 * Сюда же попали корзина документов и журнал писем: цель у них та же — не
 * хранить дольше, чем нужно, — и отдельное ночное задание ради каждого
 * заводить незачем.
 */
const ANONYMIZE_AFTER_DAYS = 90;
const DROP_UNFINISHED_AFTER_DAYS = 30;
const DROP_REQUESTS_AFTER_DAYS = 365;
const DROP_CONSENTS_AFTER_DAYS = 3 * 365;

/**
 * Через сколько дней из журнала писем убирается адрес участника.
 *
 * Год — столько же, сколько живёт заявка с публичной формы, и по той же
 * причине: вопрос «а мне точно отправляли?» приходит в пределах сезона,
 * следующего за награждением. Дальше адрес не нужен ни для чего.
 *
 * Убираем только адрес. Сам факт отправки, поток письма, статус доставки
 * и время остаются: это не персональные данные, а история выдачи документа,
 * и по ней организация отвечает на вопросы о своём награждении. Обезличенное
 * письмо помечено пустым адресом — отдельного признака для этого не заводим.
 */
const ANONYMIZE_EMAILS_AFTER_DAYS = 365;

/** Пустой адрес значит «уже обезличено»: повторно такие письма не трогаем. */
const ANONYMIZED_ADDRESS = '';

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
    private readonly documents: DocumentsService,
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
  async run(): Promise<{
    anonymized: number;
    emails: number;
    unfinished: number;
    requests: number;
    consents: number;
    trashed: number;
  }> {
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

    /*
     * Адреса участников в журнале писем.
     *
     * Само письмо не удаляем: на нём держится история выдачи, которую
     * показывает карточка документа в реестре, и связанные с ним события
     * доставки. Стирается ровно адрес — то единственное в этой таблице,
     * что относится к участнику лично.
     */
    const emails = await this.prisma.email.updateMany({
      where: {
        queuedAt: { lt: before(ANONYMIZE_EMAILS_AFTER_DAYS) },
        NOT: { toEmail: ANONYMIZED_ADDRESS },
      },
      data: { toEmail: ANONYMIZED_ADDRESS },
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

    // Корзина: документы вместе с выданными файлами и записями о них.
    const trashed = await this.documents.purgeExpired(before(TRASH_DAYS));

    const result = {
      anonymized: anonymized.count,
      emails: emails.count,
      unfinished: unfinished.count,
      requests: requests.count,
      consents: consents.count,
      trashed,
    };
    if (Object.values(result).some((n) => n > 0)) {
      this.logger.log(
        `Сроки хранения: обезличено заявок ${result.anonymized}, писем ${result.emails}, ` +
          `удалено незавершённых ${result.unfinished}, заявок ${result.requests}, ` +
          `согласий ${result.consents}, документов из корзины ${result.trashed}`,
      );
    }
    return result;
  }
}
