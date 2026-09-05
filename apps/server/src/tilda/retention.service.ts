import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { TRASH_DAYS } from '@gramota/shared';
import { PrismaService } from '../prisma/prisma.service';
import { DocumentsService } from '../documents/documents.service';
import { StorageService } from '../storage/storage.service';
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
 *
 * И последним — сверка хранилища с таблицей файлов. Она уже не про закон,
 * а про то, что удалять брошенные объекты больше некому: их ключ знала
 * только та запись `File`, которой не появилось. Расписание и очередь
 * у неё те же, что у сроков хранения, — второго ночного задания ради
 * одного обхода бакета заводить незачем.
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

/**
 * Через сколько объект в хранилище без записи в базе считается брошенным.
 *
 * Записи и байты пишутся не одним действием: сперва байты в хранилище,
 * потом строка в `File` (или наоборот — при загрузке бланка). Упавшая
 * посередине генерация или оборванная загрузка оставляют объект, на
 * который уже никто никогда не сошлётся, и удалить его больше некому:
 * ключ известен только той строке, которой не появилось.
 *
 * Сутки — это запас на операцию, идущую прямо сейчас. Свежий объект
 * может быть половиной ещё не завершённой загрузки, и удалить его
 * значило бы сломать работу, которая идёт нормально.
 */
const DROP_ORPHAN_OBJECTS_AFTER_DAYS = 1;

/**
 * Приставка ключей, которые вообще принадлежат приложению.
 *
 * Сверяем только их. Копии базы кладутся под `db/` и в отдельный бакет,
 * но бакет задаётся переменной окружения — и если однажды его укажут
 * тем же, сверка не должна принять копии за мусор: записи в `File` у них
 * нет и быть не может.
 */
const ORPHAN_PREFIX = 'org/';

/** Сколько ключей проверяем в базе одним запросом. */
const ORPHAN_BATCH = 500;

/**
 * Предохранитель на случай, когда база не та.
 *
 * Восстановленная из старой копии база «не знает» о недавних файлах —
 * и сверка честно посчитает мусором всё, что выдано после копии.
 * Упереться в потолок и написать об этом в журнал лучше, чем за одну
 * ночь стереть выданные документы.
 */
const MAX_ORPHANS_PER_RUN = 1000;

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
    private readonly storage: StorageService,
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

  /**
   * Объекты хранилища, на которые не ссылается ни одна запись `File`.
   *
   * Сверяем в обе стороны неравноправно: строка без байтов — это ошибка,
   * которую видно в кабинете, а байты без строки не видит никто. Поэтому
   * ходим от хранилища к базе, а не наоборот.
   *
   * Ключ ищем среди всех записей `File`, включая помеченные удалёнными:
   * до вывоза корзины их файлы обязаны лежать на месте, иначе документ
   * не восстановить.
   */
  private async purgeOrphanObjects(before: Date): Promise<number> {
    let removed = 0;
    let batch: string[] = [];

    const flush = async () => {
      if (batch.length === 0) return;
      const known = await this.prisma.file.findMany({
        where: { s3Key: { in: batch } },
        select: { s3Key: true },
      });
      const alive = new Set(known.map((file) => file.s3Key));
      for (const key of batch) {
        if (alive.has(key) || removed >= MAX_ORPHANS_PER_RUN) continue;
        await this.storage.remove(key);
        removed++;
      }
      batch = [];
    };

    for await (const object of this.storage.listObjects(ORPHAN_PREFIX)) {
      if (object.lastModified >= before) continue;
      batch.push(object.key);
      if (batch.length >= ORPHAN_BATCH) await flush();
      if (removed >= MAX_ORPHANS_PER_RUN) break;
    }
    await flush();

    if (removed >= MAX_ORPHANS_PER_RUN) {
      this.logger.error(
        `Сверка хранилища упёрлась в потолок ${MAX_ORPHANS_PER_RUN} объектов за ночь. ` +
          'Столько мусора сразу не появляется — проверьте, та ли база подключена.',
      );
    }
    return removed;
  }

  /** Вынесено отдельно от расписания, чтобы можно было запустить руками. */
  async run(): Promise<{
    anonymized: number;
    emails: number;
    unfinished: number;
    requests: number;
    consents: number;
    trashed: number;
    orphans: number;
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

    /*
     * Сверка хранилища — последней и своим try.
     *
     * Она ходит наружу, в S3, и её отказ не должен отменять уже сделанную
     * работу по срокам хранения: та выполняется в базе и отвечает перед
     * законом, а брошенные байты подождут до следующей ночи.
     */
    let orphans = 0;
    try {
      orphans = await this.purgeOrphanObjects(before(DROP_ORPHAN_OBJECTS_AFTER_DAYS));
    } catch (err) {
      this.logger.error(
        `Сверка хранилища не удалась: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const result = {
      anonymized: anonymized.count,
      emails: emails.count,
      unfinished: unfinished.count,
      requests: requests.count,
      consents: consents.count,
      trashed,
      orphans,
    };
    if (Object.values(result).some((n) => n > 0)) {
      this.logger.log(
        `Сроки хранения: обезличено заявок ${result.anonymized}, писем ${result.emails}, ` +
          `удалено незавершённых ${result.unfinished}, заявок ${result.requests}, ` +
          `согласий ${result.consents}, документов из корзины ${result.trashed}, ` +
          `брошенных объектов хранилища ${result.orphans}`,
      );
    }
    return result;
  }
}
