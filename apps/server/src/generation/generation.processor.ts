import { randomUUID } from 'node:crypto';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { buildS3Key } from '../storage/s3-key';
import { createRenderToken } from '../render/render-token';
import type { Env } from '../config/env';
import { PdfRenderer } from './pdf-renderer';
import { DEFAULT_NAME_TEMPLATE, buildFileName } from './file-name';

export const GENERATION_QUEUE = 'generation';

/**
 * Сколько строк в одной задаче очереди.
 *
 * Полсотни — это примерно минута работы воркера. Столько ждёт своей
 * очереди чужой маленький пакет, и столько работы теряется впустую,
 * если воркера убьют посреди части.
 *
 * Меньше делать незачем: у каждой части свои накладные — выборка строк,
 * пересчёт прогресса, запись в Redis. Больше — значит вернуть ту самую
 * беду, ради которой части и появились: пакет на десять тысяч строк
 * занимал воркер целиком на часы.
 */
export const CHUNK_SIZE = 50;

export interface GenerationChunk {
  jobId: string;
  /** Строки, за которые отвечает эта часть. */
  rowIds: string[];
  /** Номер части — для журнала. */
  index: number;
}

/**
 * Фоновая генерация файлов.
 *
 * Пакет живёт в Redis частями по CHUNK_SIZE строк, поэтому переживает
 * перезапуск приложения и не занимает воркер целиком. Одновременно
 * обрабатывается одна часть: рядом на сервере работает база, а Chromium —
 * самый прожорливый по памяти компонент системы.
 */
@Injectable()
export class GenerationProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GenerationProcessor.name);
  private connection?: IORedis;
  private queue?: Queue<GenerationChunk>;
  private worker?: Worker<GenerationChunk>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly config: ConfigService<Env, true>,
    private readonly renderer: PdfRenderer,
  ) {}

  onModuleInit(): void {
    this.connection = new IORedis(this.config.get('REDIS_URL', { infer: true }), {
      maxRetriesPerRequest: null,
    });
    this.queue = new Queue<GenerationChunk>(GENERATION_QUEUE, { connection: this.connection });

    if (!this.config.get('RUN_WORKER', { infer: true })) {
      this.logger.log('Воркер выключен в этом процессе (RUN_WORKER=false)');
      return;
    }

    this.worker = new Worker<GenerationChunk>(
      GENERATION_QUEUE,
      (job) => this.process(job.data),
      {
        connection: this.connection,
        /*
         * Один в один, и поднимать это число нечем.
         *
         * Отрисовки и так идут по очереди: PdfRenderer один на процесс
         * и выстраивает их в цепочку (см. его комментарий). Две части
         * разом получили бы не два браузера, а два ожидания одного —
         * зато вдвое больше недописанных файлов в памяти и в базе.
         * Память у воркера считана заранее: mem_limit 2g в
         * docker-compose.prod.yml, и превышение убивает воркер.
         *
         * Пакеты при этом друг друга не держат: их разрезали на части,
         * и между частями воркер свободен взять чужую.
         */
        concurrency: 1,
        /*
         * Часть идёт около минуты, и всё это время воркер держит замок.
         * Продлевается он сам, пока процесс жив; если процесс убит,
         * замок протухает и BullMQ отдаёт часть заново.
         *
         * maxStalledCount поднят с одного до трёх намеренно: перезапуск
         * воркера при выкате и падение по памяти в одну и ту же часть —
         * не выдумка, а обычный вторник. Зацикливания это не даёт: каждая
         * следующая попытка пропускает уже выпущенные строки и делает
         * строго меньше работы, чем предыдущая.
         */
        lockDuration: 60_000,
        stalledInterval: 60_000,
        maxStalledCount: 3,
      },
    );
    this.worker.on('failed', (job, err) => {
      this.logger.error(`Часть ${job?.id} задания ${job?.data.jobId} упала: ${err.message}`);
      // Попытки ещё остались — очередь вернётся к этой части сама.
      const attempts = job?.opts.attempts ?? 1;
      if (job && job.attemptsMade < attempts) return;
      void this.giveUp(job?.data.jobId, err);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
    this.connection?.disconnect();
  }

  /**
   * Ставит пакет в очередь частями.
   *
   * Число частей записываем до постановки: по нему их потом снимают
   * при отмене, и часть, оставшаяся в очереди после «отменено»,
   * печатала бы документы, за которые никто не просил платить.
   */
  async enqueue(
    job: { id: string; total: number; attempt: number },
    rowIds: string[],
  ): Promise<number> {
    const parts: string[][] = [];
    for (let i = 0; i < rowIds.length; i += CHUNK_SIZE) {
      parts.push(rowIds.slice(i, i + CHUNK_SIZE));
    }

    await this.prisma.generationJob.update({
      where: { id: job.id },
      data: { chunks: parts.length },
    });

    // Приоритет у всех частей пакета один и считается по размеру пакета,
    // а не части: иначе последняя часть большого пакета обгоняла бы
    // маленький пакет целиком.
    const priority = priorityFor(job.total);

    await this.queue?.addBulk(
      parts.map((chunkRows, index) => ({
        name: 'generate',
        data: { jobId: job.id, rowIds: chunkRows, index },
        opts: {
          jobId: chunkId(job.id, job.attempt, index),
          priority,
          /*
           * Три попытки на часть — против моргнувшей базы и хранилища.
           * Повторение почти бесплатно: выпущенные строки часть пропустит,
           * а платить второй раз не даст ограничение (job_id, row_id).
           */
          attempts: 3,
          backoff: { type: 'exponential', delay: 30_000 },
          removeOnComplete: 200,
          removeOnFail: 500,
        },
      })),
    );

    return parts.length;
  }

  /**
   * Снимает с очереди все части пакета, до которых воркер ещё не добрался.
   *
   * Взятую в работу часть снять нельзя, и не надо: воркер сам увидит отмену
   * между строками. Поэтому неудача здесь — не ошибка, а обычный ход событий.
   */
  async dequeue(jobId: string, attempt: number, chunks: number): Promise<void> {
    for (let index = 0; index < chunks; index++) {
      try {
        const job = await this.queue?.getJob(chunkId(jobId, attempt, index));
        await job?.remove();
      } catch {
        // Часть уже в работе или уже удалена — обе причины нас устраивают.
      }
    }
  }

  /**
   * Очередь отказалась от части окончательно — закрываем всё задание.
   *
   * Без этого оно навсегда осталось бы «в работе»: занимало бы место
   * в лимите организации и держало бы за собой бронь квоты, которую никто
   * никогда не потратит. Человек при этом видел бы вечный прогресс.
   *
   * Трогаем только незавершённые: отменённое или доделанное задание могло
   * закрыться раньше, чем очередь об этом узнала.
   */
  private async giveUp(jobId: string | undefined, err: Error): Promise<void> {
    if (!jobId) return;
    try {
      await this.prisma.generationJob.updateMany({
        where: { id: jobId, status: { in: ['queued', 'running'] } },
        data: {
          status: 'failed',
          finishedAt: new Date(),
          // Наружу — без подробностей: путь, стек и текст исключения
          // остаются в журнале сервера.
          error:
            'Выпуск прервался и не смог продолжиться. Созданные документы сохранены, ' +
            'за остальные ничего не списано — выпуск можно продолжить с того же места.',
        },
      });
    } catch (dbErr) {
      this.logger.error(
        `Не удалось закрыть задание ${jobId} после отказа очереди ` +
          `(${err.message}): ${dbErr instanceof Error ? dbErr.message : String(dbErr)}`,
      );
    }
  }

  private async process(chunk: GenerationChunk): Promise<void> {
    const { jobId } = chunk;
    const job = await this.prisma.generationJob.findUnique({
      where: { id: jobId },
      include: { document: true },
    });
    if (!job) return;
    if (job.status === 'canceled' || job.status === 'done') {
      this.logger.log(`Часть ${chunk.index} задания ${jobId}: выпуск уже закрыт, пропускаем`);
      return;
    }

    // Первая добравшаяся часть отмечает начало. updateMany, а не update:
    // остальные части не должны переписывать ни статус, ни время старта.
    await this.prisma.generationJob.updateMany({
      where: { id: jobId, status: 'queued' },
      data: { status: 'running', startedAt: job.startedAt ?? new Date(), error: null },
    });

    /*
     * Что по строкам этой части уже сделано.
     *
     * Это и есть продолжение с прерванного места: после падения воркера
     * часть приходит с начала, и без этой выборки её строки были бы
     * напечатаны, оплачены и сохранены второй раз.
     *
     * Пустой s3Key не считается выпущенным: такие записи остались от
     * прежнего порядка, когда файл заводили до отправки байтов. Документа
     * за такой записью нет, и скачать его нельзя.
     */
    /*
     * Записи без байтов, оставшиеся от прежнего порядка (файл заводился
     * до загрузки в хранилище). Документа за такой записью нет, а ключ
     * (job_id, row_id) она занимает — и строка не выпустилась бы уже
     * никогда: попытка создать файл упиралась бы в уникальность
     * и считалась чужой удачной работой.
     *
     * Разовая уборка тех же записей есть и в миграции; здесь она стоит
     * на случай, если такая запись где-то переживёт выкат.
     */
    await this.prisma.file
      .deleteMany({ where: { jobId, kind: 'generated', s3Key: '', rowId: { in: chunk.rowIds } } })
      .catch(() => undefined);

    const issued = await this.prisma.file.findMany({
      where: {
        jobId,
        kind: 'generated',
        s3Key: { not: '' },
        rowId: { in: chunk.rowIds },
      },
      select: { rowId: true },
    });
    const doneRows = new Set(issued.map((f) => f.rowId).filter((id): id is string => id !== null));

    // Неудачи прошлой попытки: строку будем пробовать снова, а запись
    // о неудаче придётся убрать, иначе строка сосчитается дважды.
    const priorFailures = new Set(
      (
        await this.prisma.generationRowFailure.findMany({
          where: { jobId, rowId: { in: chunk.rowIds } },
          select: { rowId: true },
        })
      ).map((f) => f.rowId),
    );

    const rows = await this.prisma.recipientRow.findMany({
      where: { id: { in: chunk.rowIds }, documentId: job.documentId, checked: true },
    });
    const byId = new Map(rows.map((r) => [r.id, r]));

    const secret = this.config.get('SESSION_SECRET', { infer: true });
    const format = job.format === 'jpg' ? 'jpg' : 'pdf';
    const ext = format === 'jpg' ? 'jpg' : 'pdf';
    let canceled = false;
    /** Строки, судьбу которых не удалось записать: их придётся повторить. */
    let unrecorded = 0;

    for (const rowId of chunk.rowIds) {
      if (doneRows.has(rowId)) continue;

      const row = byId.get(rowId);
      if (!row) {
        // Строку удалили или сняли отметку, пока пакет стоял в очереди.
        // Это тоже исход, и записать его надо: пока у строки нет ни файла,
        // ни причины, выпуск считается незаконченным.
        const recorded = await this.recordFailure(
          jobId,
          rowId,
          'Строку убрали из таблицы, пока шёл выпуск',
        );
        if (!recorded) unrecorded++;
        continue;
      }

      /*
       * Порядок здесь — вопрос денег, а не удобства.
       *
       * Байты уходят в хранилище первыми, запись в базе появляется после.
       * Наоборот было нельзя: воркера убивают по памяти, и `catch`,
       * который должен был убрать недописанную запись, в этот момент
       * не выполняется. Оставшаяся запись списывала бы квоту за документ,
       * которого нет, навсегда пряталась бы от повторной печати и роняла
       * скачивание архива посреди уже начатого ответа.
       *
       * Обратный порядок в худшем случае оставляет в хранилище байты,
       * на которые никто не ссылается. Это стоит копейки места и не стоит
       * никому ни одного документа.
       */
      const fileId = randomUUID();
      const publicId = randomUUID();
      const s3Key = buildS3Key({
        orgId: job.orgId,
        documentId: job.documentId,
        jobId,
        kind: 'generated',
        fileId,
        ext,
      });
      let uploaded = false;

      try {
        // Идентификатор выделяем до печати: он попадает в QR на самом листе,
        // а значит должен быть известен раньше, чем лист отрисован.
        const token = createRenderToken(
          { jobId, rowId, publicId },
          secret,
          Math.floor(Date.now() / 1000),
        );
        const body = await this.renderer.render(
          token,
          job.document.pageWidthMm,
          job.document.pageHeightMm,
          format,
        );

        const mime = format === 'jpg' ? 'image/jpeg' : 'application/pdf';
        await this.storage.put(s3Key, body, mime);
        uploaded = true;

        await this.prisma.file.create({
          data: {
            id: fileId,
            orgId: job.orgId,
            documentId: job.documentId,
            jobId,
            rowId,
            kind: 'generated',
            publicId,
            s3Key,
            sizeBytes: body.length,
            mime,
            originalName: buildFileName(DEFAULT_NAME_TEMPLATE, row.data as Record<string, string>, {
              number: row.position + 1,
              publicId,
              ext,
            }),
          },
        });

        await this.prisma.recipientRow
          .update({ where: { id: rowId }, data: { lastFileId: fileId } })
          .catch(() => undefined);

        if (priorFailures.has(rowId)) {
          // Со второго раза получилось: причина неудачи больше не факт.
          await this.prisma.generationRowFailure
            .deleteMany({ where: { jobId, rowId } })
            .catch(() => undefined);
        }
      } catch (err) {
        if (isDuplicateRow(err)) {
          /*
           * Ту же строку в том же задании выпустил кто-то ещё.
           *
           * Так бывает, когда BullMQ отдал протухшую часть второму
           * процессу, а первый на самом деле жив. Документ у участника
           * будет один — это гарантирует ограничение в базе, — и ошибкой
           * такое считать нельзя: работа сделана, просто не нами.
           * А вот наши байты в хранилище лишние.
           */
          if (uploaded) await this.storage.remove(s3Key).catch(() => undefined);
          continue;
        }

        // Одна плохая строка не должна ронять всё награждение:
        // записываем причину и продолжаем, отчёт покажем в интерфейсе.
        if (uploaded) await this.storage.remove(s3Key).catch(() => undefined);
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Строка ${rowId}: ${message}`);
        const recorded = await this.recordFailure(jobId, rowId, 'Документ не удалось создать');
        if (!recorded) unrecorded++;
      }

      /*
       * Прогресс и проверка отмены — одной записью: та же запись, которой
       * мы отмечаем прогресс, возвращает текущее состояние задания.
       *
       * Внутри try, и это принципиально: моргнувшая база на одной строке
       * не должна ронять весь выпуск. Не узнали статус — просто печатаем
       * дальше и спросим на следующей строке.
       *
       * Прерываемся между строками, а не посреди отрисовки: брошенная
       * на середине строка оставила бы в хранилище файл, которого нет
       * в базе.
       */
      if ((await this.progress(jobId)) === 'canceled') {
        canceled = true;
        break;
      }
    }

    if (canceled) {
      this.logger.log(`Часть ${chunk.index} задания ${jobId} остановлена: выпуск отменён`);
      return;
    }

    if (unrecorded > 0) {
      /*
       * Судьбу этих строк записать не удалось, а значит выпуск по ним
       * не закончен и никогда сам не закончится. Роняем часть намеренно:
       * очередь вернёт её и повторит — повторение почти бесплатно,
       * потому что выпущенные строки будут пропущены.
       */
      throw new Error(`Не удалось записать исход ${unrecorded} строк — часть будет повторена`);
    }

    await this.progress(jobId);
    await this.finish(jobId, job.total);
  }

  /**
   * Пересчитывает готовое и неудачное по фактам и заодно приносит статус.
   *
   * Именно пересчёт, а не приращение: части пакета идут вразнобой, и часть,
   * вернувшаяся из очереди после перезапуска воркера, прибавила бы своё
   * второй раз. Ошибку записи глотаем — прогресс дело показательное,
   * ради него останавливать печать не за что.
   */
  private async progress(jobId: string): Promise<string | null> {
    try {
      const [done, failed] = await Promise.all([
        this.prisma.file.count({ where: { jobId, kind: 'generated', s3Key: { not: '' } } }),
        this.prisma.generationRowFailure.count({ where: { jobId } }),
      ]);
      const job = await this.prisma.generationJob.update({
        where: { id: jobId },
        data: { done, failed },
        select: { status: true },
      });
      return job.status;
    } catch (err) {
      this.logger.warn(
        `Не удалось записать прогресс задания ${jobId}: ` +
          `${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }

  /**
   * Закрывает выпуск, если по всем строкам есть исход.
   *
   * Части идут вразнобой и заканчиваются в любом порядке, поэтому «я была
   * последней» ни одна из них знать не может. Зато может спросить у фактов:
   * пока файлов и записанных неудач меньше обещанного, кто-то ещё в пути.
   *
   * Считать по счётчику частей нельзя: часть, вернувшаяся из очереди после
   * падения, отметилась бы дважды, выпуск закрылся бы раньше времени —
   * и участникам ушла бы половина писем.
   */
  private async finish(jobId: string, total: number): Promise<void> {
    try {
      const [issued, failed] = await Promise.all([
        this.prisma.file.count({ where: { jobId, kind: 'generated', s3Key: { not: '' } } }),
        this.prisma.generationRowFailure.count({ where: { jobId } }),
      ]);
      if (issued + failed < total) return;

      await this.prisma.generationJob.updateMany({
        where: { id: jobId, status: { in: ['queued', 'running'] } },
        data: {
          // Упавшим считаем только выпуск, не давший ни одного документа:
          // девяносто девять грамот из ста — это удача с оговоркой,
          // а не провал.
          status: issued === 0 ? 'failed' : 'done',
          done: issued,
          failed,
          finishedAt: new Date(),
          error: failed ? `Не удалось создать файлов: ${failed}` : null,
        },
      });
      this.logger.log(`Задание ${jobId}: создано ${issued}, ошибок ${failed}`);
    } catch (err) {
      // Не закрыли — закроет следующая часть или продолжение выпуска.
      this.logger.warn(
        `Не удалось закрыть задание ${jobId}: ` +
          `${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /** Записывает причину неудачи. false — записать не удалось, строку надо повторить. */
  private async recordFailure(jobId: string, rowId: string, message: string): Promise<boolean> {
    try {
      await this.prisma.generationRowFailure.upsert({
        where: { jobId_rowId: { jobId, rowId } },
        create: { jobId, rowId, message },
        update: { message },
      });
      return true;
    } catch (err) {
      this.logger.error(
        `Не удалось записать неудачу строки ${rowId}: ` +
          `${err instanceof Error ? err.message : String(err)}`,
      );
      return false;
    }
  }
}

/** Идентификатор части в очереди. Номер попытки нужен, чтобы не спорить с прошлой. */
function chunkId(jobId: string, attempt: number, index: number): string {
  return `${jobId}:${attempt}:${index}`;
}

/**
 * Место в очереди по размеру пакета: меньше пакет — раньше очередь.
 *
 * У BullMQ меньшее число значит более высокий приоритет. Смысл житейский:
 * пять грамот печатаются минуту, и заставлять их ждать за чужой тысячей —
 * значит потерять человека, для которого сервис работает «долго».
 * Обратный порядок не стоит почти ничего: тысяча подождёт лишнюю минуту
 * и не заметит.
 *
 * Само по себе это ничего не решало бы: приоритет расставляет только те
 * задачи, что ещё не начаты, а пакет, взятый в работу целиком, держал бы
 * воркер до конца. Работает пара — приоритет и разрезание пакета на части
 * по CHUNK_SIZE строк: между частями воркер свободен, и маленький пакет
 * встаёт следующим, а не последним.
 *
 * Ступеньками, а не по числу строк: иначе пакет из 501 строки обгонял бы
 * пакет из 500, поставленный часом раньше, и внутри одного размера порядок
 * перестал бы быть живой очередью.
 *
 * Плата за это — теория о том, что при непрерывном потоке мелких пакетов
 * большой не дождётся никогда. На нашем потоке это не встречается,
 * а лечится, если встретится, повышением приоритета по времени ожидания.
 */
export function priorityFor(total: number): number {
  if (total <= 10) return 1;
  if (total <= 50) return 2;
  if (total <= 200) return 3;
  return 4;
}

/** Нарушение уникальности (job_id, row_id) — тот самый ключ идемпотентности. */
function isDuplicateRow(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';
}
