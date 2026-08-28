import { createHash } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { ReferralService } from '../referral/referral.service';
import type { Env } from '../config/env';

/** Задания, которые ещё займут воркер, — они же держат часть квоты. */
const ACTIVE_STATUSES = ['queued', 'running'] as const;

/** Задание и строки, которые по нему предстоит выпустить. */
export interface StartedJob {
  job: {
    id: string;
    orgId: string;
    documentId: string;
    total: number;
    attempt: number;
    done: number;
    failed: number;
  };
  rowIds: string[];
}

@Injectable()
export class GenerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly referral: ReferralService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Создаёт задание на отмеченные строки. Сама генерация идёт в воркере. */
  async start(orgId: string, documentId: string, format: 'pdf' | 'jpg'): Promise<StartedJob> {
    const doc = await this.prisma.document.findFirst({
      where: { id: documentId, orgId, deletedAt: null },
      include: { sheets: { orderBy: { position: 'asc' } } },
    });
    if (!doc) throw new NotFoundException('Документ не найден');

    const hasContent = doc.sheets.some(
      (s) => Array.isArray(s.layout) && (s.layout as unknown[]).length > 0,
    );
    if (!hasContent) {
      throw new BadRequestException('В документе нет ни одного блока — сначала соберите макет');
    }

    /*
     * Дальше идёт всё, что нельзя делать двум запросам одновременно:
     * проверка лимита пробы, счёт заданий организации и создание задания.
     *
     * Без замка два окна кабинета, нажавшие «Создать документы» в одну
     * секунду по разным документам, оба увидели бы «осталось 20» и оба
     * прошли бы проверку — на бесплатной пробе выпустилось бы сорок
     * документов вместо двадцати. Замок берём на организацию, а не на
     * таблицу: чужие организации ждать друг друга не должны.
     */
    return this.withOrgLock(orgId, async (tx) => {
      /*
       * Строки читаем здесь же, а не считаем отдельным запросом.
       *
       * Число строк и сам список обязаны быть одним и тем же снимком:
       * пакет режется на части по этому списку, а закончившимся считается,
       * когда исход есть у total строк. Разойдись они хоть на одну —
       * выпуск не закрылся бы никогда.
       */
      const rows = await tx.recipientRow.findMany({
        where: { documentId, checked: true },
        orderBy: { position: 'asc' },
        select: { id: true },
      });
      if (rows.length === 0) {
        throw new BadRequestException('Не отмечено ни одной строки в таблице получателей');
      }

      const running = await tx.generationJob.findFirst({
        where: { documentId, status: { in: [...ACTIVE_STATUSES] } },
      });
      if (running) {
        throw new BadRequestException('Генерация по этому документу уже идёт');
      }

      await this.checkOrgJobs(orgId, tx);
      await this.checkFreeLimit(orgId, rows.length, await this.reserved(orgId, tx), tx);

      const job = await tx.generationJob.create({
        data: { orgId, documentId, format, total: rows.length },
      });
      return { job, rowIds: rows.map((r) => r.id) };
    });
  }

  /**
   * Продолжает упавший или отменённый выпуск с того места, где он встал.
   *
   * Без этого пути падение на девять тысяч девятисотой строке из десяти
   * тысяч означало бы новый выпуск с нуля — и повторное списание девяти
   * тысяч девятисот документов. Ключ идемпотентности у нас (jobId, rowId),
   * и это намеренно: повторный выпуск того же документа по исправленному
   * списку должен оставаться возможным и должен оплачиваться. Но «доделай
   * прерванное» — не повторный выпуск, а то же самое задание, поэтому
   * и продолжается оно под тем же jobId.
   *
   * Строки берём отмеченные сейчас, а не те, что были отмечены в начале:
   * если за это время отметки сняли, навязывать человеку документы,
   * от которых он отказался, не за что.
   */
  async resume(orgId: string, jobId: string): Promise<StartedJob> {
    const existing = await this.getJob(orgId, jobId);
    if (existing.status !== 'failed' && existing.status !== 'canceled') {
      throw new BadRequestException(
        existing.status === 'done'
          ? 'Этот выпуск уже завершён — продолжать нечего'
          : 'Этот выпуск и так идёт',
      );
    }

    return this.withOrgLock(orgId, async (tx) => {
      const job = await tx.generationJob.findFirst({ where: { id: jobId, orgId } });
      if (!job) throw new NotFoundException('Задание не найдено');
      if (job.status !== 'failed' && job.status !== 'canceled') {
        throw new BadRequestException('Этот выпуск уже продолжили');
      }

      const rows = await tx.recipientRow.findMany({
        where: { documentId: job.documentId, checked: true },
        orderBy: { position: 'asc' },
        select: { id: true },
      });
      const issued = await tx.file.findMany({
        where: { jobId, kind: 'generated', s3Key: { not: '' } },
        select: { rowId: true },
      });
      const done = new Set(issued.map((f) => f.rowId).filter((id): id is string => id !== null));
      const todo = rows.map((r) => r.id).filter((id) => !done.has(id));

      if (todo.length === 0) {
        // Оказалось, что доделывать нечего: закрываем задание и не берём
        // ни одного документа сверх уже выпущенных. Обещание приводим
        // к тому, что вышло: «готово 50 из 100» под словом «завершено»
        // заставляет искать полсотни пропавших документов, которых
        // человек сам и не захотел.
        const closed = await tx.generationJob.update({
          where: { id: jobId },
          data: {
            status: 'done',
            total: issued.length,
            done: issued.length,
            failed: 0,
            finishedAt: new Date(),
            error: null,
            chunks: 0,
          },
        });
        await tx.generationRowFailure.deleteMany({ where: { jobId } });
        return { job: closed, rowIds: [] };
      }

      await this.checkOrgJobs(orgId, tx, jobId);
      // Незаконченные строки этого задания в брони не числятся: задание
      // не активно. Поэтому проверяем их так же, как новый выпуск.
      await this.checkFreeLimit(orgId, todo.length, await this.reserved(orgId, tx, jobId), tx);

      /*
       * Прежние причины неудач убираем целиком.
       *
       * Строка либо уже стала файлом — тогда причины у неё и так нет, —
       * либо попадёт в todo и будет напечатана заново. А исчезнувшие
       * из таблицы строки в новом total не участвуют, и их причины
       * тоже больше не нужны.
       */
      await tx.generationRowFailure.deleteMany({ where: { jobId } });

      const revived = await tx.generationJob.update({
        where: { id: jobId },
        data: {
          status: 'queued',
          // Обещание пересчитано под сегодняшний список отмеченных строк:
          // по нему потом определяется, что выпуск закончился.
          total: done.size + todo.length,
          done: done.size,
          failed: 0,
          error: null,
          finishedAt: null,
          // Номер попытки входит в идентификаторы частей в очереди:
          // без него BullMQ молча отказался бы ставить их заново.
          attempt: { increment: 1 },
        },
      });

      return { job: revived, rowIds: todo };
    });
  }

  /**
   * Отмена начатого выпуска.
   *
   * Квоту за необработанные строки возвращать нечем и не нужно: она нигде
   * не хранится числом. Списанное — это созданные файлы, а строки, до которых
   * воркер не дошёл, файлов не создали. Отменённое задание перестаёт быть
   * активным, и вместе с ним из расчёта уходит его бронь. Возврат получается
   * сам собой, и именно поэтому ему нечему разойтись с реальностью.
   *
   * Воркер узнаёт об отмене не по сигналу, а по состоянию задания, которое
   * читает между строками: прервать его посреди отрисовки — значит оставить
   * в хранилище файл, которого нет в базе.
   */
  async cancel(orgId: string, jobId: string) {
    const job = await this.getJob(orgId, jobId);

    if (job.status !== 'queued' && job.status !== 'running') {
      throw new BadRequestException('Это задание уже завершено — отменять нечего');
    }

    const canceled = await this.prisma.generationJob.update({
      where: { id: jobId },
      data: { status: 'canceled', finishedAt: new Date() },
    });

    return {
      job: canceled,
      /** Сколько строк осталось необработанными — столько квоты и не списалось. */
      refunded: Math.max(0, canceled.total - canceled.done - canceled.failed),
    };
  }

  /**
   * Сколько пакетов организация уже держит в очереди.
   *
   * Ограничение не про память воркера — он берёт части по одной, — а про
   * очередь: одна организация, поставившая двадцать пакетов, задвинула бы
   * всех остальных в конец.
   */
  private async checkOrgJobs(orgId: string, tx: TxClient, exceptJobId?: string): Promise<void> {
    const active = await tx.generationJob.count({
      where: {
        orgId,
        status: { in: [...ACTIVE_STATUSES] },
        ...(exceptJobId ? { id: { not: exceptJobId } } : {}),
      },
    });
    const limit = this.config.get('ORG_ACTIVE_JOBS', { infer: true });
    if (active >= limit) {
      throw new BadRequestException(
        `Одновременно можно выпускать не больше ${limit} пакетов. ` +
          `Дождитесь окончания или отмените лишний — документы уже созданные ` +
          `при отмене никуда не денутся.`,
      );
    }
  }

  /** Строки принятых, но ещё не напечатанных заданий: они держат часть квоты. */
  private async reserved(orgId: string, tx: TxClient, exceptJobId?: string): Promise<number> {
    const active = await tx.generationJob.findMany({
      where: {
        orgId,
        status: { in: [...ACTIVE_STATUSES] },
        ...(exceptJobId ? { id: { not: exceptJobId } } : {}),
      },
      select: { total: true, done: true, failed: true },
    });
    return active.reduce((sum, j) => sum + Math.max(0, j.total - j.done - j.failed), 0);
  }

  /**
   * Бесплатная проба: не больше FREE_DOCUMENT_LIMIT выпущенных документов
   * на организацию. Ровно это число обещано на посадочной странице.
   *
   * Выпущенное считаем по файлам, а не отдельным счётчиком: счётчик пришлось
   * бы держать в согласии с реальностью при каждой ошибке, отмене и удалении,
   * а файлы и есть то, что человек получил. Запрос идёт один раз на задание,
   * а не на документ, поэтому на наших объёмах он ничего не стоит.
   *
   * К выпущенному прибавляется бронь — строки уже принятых заданий, которые
   * воркер ещё не напечатал. Без неё два пакета по тридцать строк на остатке
   * в двадцать документов прошли бы оба: файлов на момент проверки нет ни
   * у одного. Бронь тоже считается по фактам, а не счётчиком, и исчезает
   * вместе с заданием — завершённым, упавшим или отменённым.
   *
   * Проверяем до постановки задания: узнать об исчерпанном лимите на сорок
   * седьмом документе из пятидесяти — это уже испорченное награждение.
   */
  private async checkFreeLimit(
    orgId: string,
    adding: number,
    reserved = 0,
    tx: TxClient = this.prisma,
  ): Promise<void> {
    const org = await tx.organization.findUnique({ where: { id: orgId } });
    if (!org || org.plan !== 'free') return;

    const base = Number(process.env.FREE_DOCUMENT_LIMIT ?? 50);
    // Заработанное приглашениями прибавляется к пробе. Считается по фактам,
    // а не по счётчику, — см. ReferralService. Читает через ту же транзакцию:
    // мы под замком, и заглядывать мимо него незачем.
    const bonus = await this.referral.bonusDocuments(orgId, tx);
    const limit = base + bonus;
    const issued = await tx.file.count({ where: { orgId, kind: 'generated' } });
    const used = issued + reserved;

    if (used + adding > limit) {
      const left = Math.max(0, limit - used);
      // Про приглашения говорим только тем, у кого проба на исходе: раньше
      // это выглядело бы навязыванием, а здесь это ответ на их вопрос
      // «что делать дальше».
      const hint =
        ` Или пригласите коллегу в разделе «Пригласить друга» — за каждого, ` +
        `кто начнёт работать, добавим ещё документов.`;
      // Про бронь говорим отдельно: «выпущено 45 из 50» при пустом списке
      // файлов выглядит ошибкой сервиса, а не занятым местом.
      const held = reserved > 0 ? ` (из них ${reserved} держит незаконченный выпуск)` : '';
      throw new BadRequestException(
        left === 0
          ? `Бесплатная проба закончилась: выпущено ${used} документов из ${limit}${held}. ` +
            `Чтобы продолжить, выберите тариф на vruchay.ru.${hint}`
          : `На бесплатной пробе осталось ${left} документов из ${limit}${held}, ` +
            `а отмечено ${adding}. Снимите лишние отметки или выберите тариф.${hint}`,
      );
    }
  }

  async getJob(orgId: string, jobId: string) {
    const job = await this.prisma.generationJob.findFirst({ where: { id: jobId, orgId } });
    if (!job) throw new NotFoundException('Задание не найдено');
    return job;
  }

  async listJobs(orgId: string, documentId: string) {
    return this.prisma.generationJob.findMany({
      where: { orgId, documentId },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
  }

  /**
   * Поимённо, кого выпуск не осилил, — для отчёта в кабинете.
   *
   * Имя достаём отдельным запросом, а не связью: строки может уже не быть
   * в таблице, и это одна из причин попасть в список.
   */
  async jobFailures(orgId: string, jobId: string) {
    await this.getJob(orgId, jobId);
    const failures = await this.prisma.generationRowFailure.findMany({
      where: { jobId },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
    if (failures.length === 0) return [];

    const rows = await this.prisma.recipientRow.findMany({
      where: { id: { in: failures.map((f) => f.rowId) } },
      select: { id: true, data: true },
    });
    const names = new Map(
      rows.map((r) => [r.id, String((r.data as Record<string, string>)?.name ?? '').trim()]),
    );

    return failures.map((f) => ({
      rowId: f.rowId,
      name: names.get(f.rowId) || 'Строки больше нет в таблице',
      reason: f.message,
    }));
  }

  /**
   * Файлы задания — для скачивания архивом или общим PDF.
   *
   * Пустой s3Key отсекаем: такие записи остались от прежнего порядка,
   * когда файл заводили до отправки байтов в хранилище. Байтов за ними нет,
   * и попытка отдать такой файл рвала бы уже начатый архив на середине —
   * человек скачал бы битый zip без единого слова об ошибке.
   *
   * Строку тянем вместе с файлом: из её колонок собирается имя файла
   * по шаблону, а второй запрос на каждый файл в пакете из тысячи —
   * это тысяча запросов.
   */
  async jobFiles(orgId: string, jobId: string) {
    await this.getJob(orgId, jobId);
    return this.prisma.file.findMany({
      // orgId в условии избыточен после проверки задания и стоит здесь
      // намеренно: выборка чужих файлов не должна зависеть от того,
      // не забыл ли вызывающий проверить задание.
      where: { jobId, orgId, deletedAt: null, s3Key: { not: '' } },
      orderBy: { createdAt: 'asc' },
      include: { row: { select: { data: true } } },
    });
  }

  /**
   * Берёт замок на организацию и выполняет работу в одной транзакции.
   *
   * Именно транзакционный замок (pg_advisory_xact_lock): он снимается вместе
   * с транзакцией, в том числе при ошибке и при обрыве соединения. Замок,
   * который нужно снимать руками, однажды не снимут — и организация
   * останется без выпуска до перезапуска базы.
   */
  private withOrgLock<T>(orgId: string, work: (tx: TxClient) => Promise<T>): Promise<T> {
    const key = lockKey(orgId);
    return this.prisma.$transaction(async (tx) => {
      /*
       * Именно $executeRaw, а не $queryRaw: pg_advisory_xact_lock возвращает
       * void, и Prisma 6.19 не умеет разбирать такой столбец — запрос падает
       * с P2010 «Failed to deserialize column of type 'void'». $executeRaw
       * столбцы не разбирает вовсе, а замок берётся точно так же.
       */
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${key}::bigint)`;
      return work(tx as unknown as TxClient);
    });
  }
}

/** Часть клиента Prisma, которой хватает и транзакции, и обычному вызову. */
type TxClient = Pick<
  PrismaService,
  'organization' | 'file' | 'generationJob' | 'recipientRow' | 'generationRowFailure'
>;

/**
 * Число для pg_advisory_xact_lock из идентификатора организации.
 *
 * Считаем от хеша, а не разбираем uuid как шестнадцатеричное число: замок
 * не должен зависеть от того, в каком виде идентификатор пришёл, и падать
 * на неожиданном значении из сессии тем более. Берём 63 бита — знаковый
 * bigint без риска уйти в минус. Совпадение у двух организаций означало бы
 * лишь, что они подождут друг друга, — не ошибку.
 */
function lockKey(orgId: string): bigint {
  const digest = createHash('sha256').update(orgId).digest();
  return digest.readBigUInt64BE(0) >> 1n;
}
