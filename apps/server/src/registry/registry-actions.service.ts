import { createHash } from 'node:crypto';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@prisma/client';
import type { Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { ReferralService } from '../referral/referral.service';
import { GenerationProcessor } from '../generation/generation.processor';
import { MailService } from '../mail/mail.service';
import { MailProcessor } from '../mail/mail.processor';
import { ReplacementService } from './replacement.service';

/** Задания, которые ещё займут воркер, — они же держат часть квоты. */
const ACTIVE_STATUSES = ['queued', 'running'] as const;

/** Кого действие не коснулось и почему. */
export interface SkippedItem {
  fileId: string;
  name: string;
  reason: string;
}

/**
 * Массовые действия над выданными документами.
 *
 * Отзыв, перевыпуск и переотправка — три разных ответа на три разные беды,
 * и путать их нельзя. Отзыв говорит «этого документа больше нет».
 * Перевыпуск говорит «вот правильный вместо неправильного». Переотправка
 * не говорит ничего — она просто ещё раз кладёт письмо в ящик.
 */
@Injectable()
export class RegistryActionsService {
  private readonly logger = new Logger(RegistryActionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly replacement: ReplacementService,
    private readonly referral: ReferralService,
    private readonly generation: GenerationProcessor,
    private readonly mail: MailService,
    private readonly mailProcessor: MailProcessor,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /**
   * Отозвать проверку у пачки документов или вернуть её.
   *
   * Сами файлы остаются: их могли скачать и распечатать, и делать вид,
   * что их не было, бессмысленно. Меняется ответ страницы проверки.
   */
  async setRevoked(orgId: string, fileIds: string[], revoked: boolean) {
    const files = await this.prisma.file.findMany({
      where: { id: { in: fileIds }, orgId, kind: 'generated', deletedAt: null },
      select: { id: true, row: { select: { data: true } } },
    });
    if (files.length === 0) throw new BadRequestException('Ни один из документов не найден');

    const ids = files.map((f) => f.id);
    await this.prisma.file.updateMany({
      // orgId в условии избыточен после выборки и стоит здесь намеренно:
      // изменение чужих документов не должно зависеть от того, не забыл ли
      // вызывающий отфильтровать список.
      where: { id: { in: ids }, orgId },
      data: { verifyRevoked: revoked },
    });

    return { changed: ids.length, names: files.map(nameOf).filter(Boolean) };
  }

  /**
   * Перевыпуск: выдать новый документ вместо этого.
   *
   * Не то же самое, что отзыв. Опечатались в фамилии — участник не виноват
   * и без грамоты остаться не должен: старый документ помечается заменённым,
   * новый встаёт на его место, а страница проверки старого показывает,
   * где взять новый.
   *
   * Выпуск идёт через ту же очередь, что и обычный, — второй очереди
   * в системе быть не должно. Задание создаётся здесь, а не в
   * `GenerationService.start`: тот выпускает все отмеченные строки
   * материала, а перевыпуск касается ровно выбранных.
   */
  async reissue(orgId: string, fileIds: string[]) {
    const files = await this.prisma.file.findMany({
      where: { id: { in: fileIds }, orgId, kind: 'generated', deletedAt: null },
      select: {
        id: true,
        orgId: true,
        mime: true,
        documentId: true,
        rowId: true,
        replacedById: true,
        replacedByJobId: true,
        row: { select: { data: true } },
        document: { select: { deletedAt: true } },
      },
    });
    if (files.length === 0) throw new BadRequestException('Ни один из документов не найден');

    // Обещания прошлых перевыпусков сначала доводим до конца: иначе
    // упавший выпуск навсегда запрещал бы повторить попытку.
    const settled = await this.replacement.settle(files);

    const skipped: SkippedItem[] = [];
    const groups = new Map<string, typeof files>();

    for (const file of files) {
      const change = settled.get(file.id);
      const replacedById = change ? change.replacedById : file.replacedById;
      const pending = change ? false : file.replacedByJobId !== null;
      const skip = (reason: string) => skipped.push({ fileId: file.id, name: nameOf(file), reason });

      if (!file.documentId || !file.document) {
        skip('материал удалён — перевыпускать не из чего');
        continue;
      }
      if (file.document.deletedAt) {
        skip('материал в корзине — сначала восстановите его');
        continue;
      }
      if (!file.rowId) {
        skip('строки больше нет в таблице получателей');
        continue;
      }
      if (replacedById) {
        skip('документ уже заменён — перевыпускайте тот, что его заменил');
        continue;
      }
      if (pending) {
        skip('перевыпуск уже заказан и ещё идёт');
        continue;
      }

      const group = groups.get(file.documentId) ?? [];
      group.push(file);
      groups.set(file.documentId, group);
    }

    const jobs: { jobId: string; documentId: string; total: number }[] = [];
    let reissued = 0;

    for (const [documentId, group] of groups) {
      /*
       * Формат берём у первого документа пачки: задание на выпуск знает
       * один формат на всех, а разные форматы внутри одного материала —
       * случай, которого в жизни не встречается (формат выбирается
       * на выпуск, а не на строку).
       */
      const format = group[0].mime === 'image/jpeg' ? 'jpg' : 'pdf';
      const rowIds = [...new Set(group.map((f) => f.rowId as string))];

      try {
        const job = await this.createReissueJob(
          orgId,
          documentId,
          format,
          rowIds,
          group.map((f) => f.id),
        );
        await this.generation.enqueue(job, rowIds);
        jobs.push({ jobId: job.id, documentId, total: rowIds.length });
        reissued += group.length;
      } catch (err) {
        if (!(err instanceof BadRequestException)) throw err;
        // Отказ по одному материалу не должен отменять перевыпуск по
        // остальным: человек отметил строки из разных турниров и ждёт
        // ответа по каждому.
        const reason = err.message;
        for (const file of group) skipped.push({ fileId: file.id, name: nameOf(file), reason });
      }
    }

    return { reissued, jobs, skipped };
  }

  /**
   * Переотправить письмо с уже выпущенным документом.
   *
   * Самый частый запрос спустя месяц после мероприятия: «письмо потерялось,
   * пришлите ещё раз». Ничего не выпускает и квоту не трогает — к письму
   * прикладывается тот же самый файл.
   */
  async resend(orgId: string, fileIds: string[]) {
    const files = await this.prisma.file.findMany({
      where: { id: { in: fileIds }, orgId, kind: 'generated', deletedAt: null },
      select: {
        id: true,
        documentId: true,
        rowId: true,
        row: { select: { data: true } },
        document: { select: { deletedAt: true } },
      },
    });
    if (files.length === 0) throw new BadRequestException('Ни один из документов не найден');

    const skipped: SkippedItem[] = [];
    const queued: string[] = [];

    for (const file of files) {
      const data = (file.row?.data ?? {}) as Record<string, string>;
      const to = (data.email ?? '').trim();
      const skip = (reason: string) => skipped.push({ fileId: file.id, name: nameOf(file), reason });

      if (!file.documentId || !file.document || file.document.deletedAt) {
        skip('материал удалён или в корзине — письмо слать не от чего');
        continue;
      }
      if (!to) {
        skip('у получателя не указан адрес почты');
        continue;
      }

      try {
        const emailId = await this.mail.queueSingle(orgId, file.documentId, to, data, file.id);
        // Строку письму проставляем сами: одиночная постановка её не знает,
        // а без неё переотправленное письмо потерялось бы для реестра
        // материала, который ищет письма по строке.
        if (file.rowId) {
          await this.prisma.email.update({
            where: { id: emailId },
            data: { rowId: file.rowId },
          });
        }
        await this.mailProcessor.enqueue(emailId);
        queued.push(emailId);
      } catch (err) {
        if (!(err instanceof BadRequestException)) throw err;
        skip(err.message);
      }
    }

    return { queued: queued.length, skipped };
  }

  /**
   * Отметить скачивание.
   *
   * Считаем числом на файле, а не записями о каждом нажатии: организации
   * нужен ответ «этот документ забрали», а не журнал того, кто и когда
   * его открывал.
   */
  async countDownloads(orgId: string, fileIds: string[]): Promise<void> {
    if (fileIds.length === 0) return;
    try {
      await this.prisma.file.updateMany({
        where: { id: { in: fileIds }, orgId },
        data: { downloadCount: { increment: 1 } },
      });
    } catch (err) {
      // Счётчик не стоит того, чтобы из-за него срывалось скачивание.
      this.logger.warn(
        `Не удалось учесть скачивание: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Задание на перевыпуск выбранных строк.
   *
   * Всё, что нельзя делать двум запросам одновременно, идёт под замком
   * на организацию — так же, как в обычном выпуске: без него два окна
   * кабинета выпустили бы вдвое больше документов, чем позволяет проба.
   */
  private createReissueJob(
    orgId: string,
    documentId: string,
    format: 'pdf' | 'jpg',
    rowIds: string[],
    fileIds: string[],
  ) {
    return this.withOrgLock(orgId, async (tx) => {
      const running = await tx.generationJob.findFirst({
        where: { documentId, status: { in: [...ACTIVE_STATUSES] } },
      });
      if (running) {
        throw new BadRequestException(
          'По этому материалу уже идёт выпуск — дождитесь его окончания',
        );
      }

      await this.checkFreeLimit(orgId, rowIds.length, tx);

      /*
       * Отметку строки восстанавливаем: воркер печатает только отмеченные,
       * и снятая отметка означала бы «задание принято, документ не вышел».
       * Отметка — это «строка участвует в выпуске», и перевыпуск как раз
       * и есть решение выпустить по ней документ ещё раз.
       */
      await tx.recipientRow.updateMany({
        where: { id: { in: rowIds }, documentId },
        data: { checked: true },
      });

      const job = await tx.generationJob.create({
        data: { orgId, documentId, format, total: rowIds.length },
      });

      /*
       * На старых файлах отмечаем обещание замены, а не саму замену:
       * нового документа ещё нет и может не быть — выпуск падает,
       * его отменяют. Пока замены нет, старый документ действителен.
       * Подтверждает обещание ReplacementService.
       */
      await tx.file.updateMany({
        where: { id: { in: fileIds }, orgId },
        data: { replacedByJobId: job.id },
      });

      return job;
    });
  }

  /**
   * Бесплатная проба: перевыпуск создаёт новые файлы и потому считается.
   *
   * Повторяет проверку из `GenerationService`, а не вызывает её: очередь
   * выпуска в этой ветке только читается и не меняется, а вынести проверку
   * в общее место — правка её модуля. Общий смысл один: выпущенное
   * считается по фактам (числу файлов), к нему прибавляется бронь уже
   * принятых заданий.
   */
  private async checkFreeLimit(
    orgId: string,
    adding: number,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const org = await tx.organization.findUnique({ where: { id: orgId } });
    if (!org || org.plan !== 'free') return;

    const base = this.config.get('FREE_DOCUMENT_LIMIT', { infer: true });
    const bonus = await this.referral.bonusDocuments(orgId, tx);
    const limit = base + bonus;

    const issued = await tx.file.count({ where: { orgId, kind: 'generated' } });
    const active = await tx.generationJob.findMany({
      where: { orgId, status: { in: [...ACTIVE_STATUSES] } },
      select: { total: true, done: true, failed: true },
    });
    const reserved = active.reduce((sum, j) => sum + Math.max(0, j.total - j.done - j.failed), 0);
    const used = issued + reserved;

    if (used + adding > limit) {
      const left = Math.max(0, limit - used);
      throw new BadRequestException(
        `На бесплатной пробе осталось ${left} документов из ${limit}, ` +
          `а на перевыпуск отмечено ${adding}. Перевыпуск создаёт новые документы ` +
          `и считается наравне с обычным выпуском.`,
      );
    }
  }

  /**
   * Берёт замок на организацию и выполняет работу в одной транзакции.
   *
   * Замок транзакционный: снимается вместе с транзакцией, в том числе при
   * ошибке и при обрыве соединения.
   */
  private withOrgLock<T>(orgId: string, work: (tx: Prisma.TransactionClient) => Promise<T>) {
    const key = lockKey(orgId);
    return this.prisma.$transaction(async (tx) => {
      /*
       * Именно $executeRaw, а не $queryRaw: pg_advisory_xact_lock возвращает
       * void, и Prisma 6.19 не умеет разбирать такой столбец — запрос падает
       * с P2010 «Failed to deserialize column of type 'void'». $executeRaw
       * столбцы не разбирает вовсе, а замок берётся точно так же.
       */
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${key}::bigint)`;
      return work(tx);
    });
  }
}

/** Имя получателя из строки — для понятных объяснений, кого пропустили. */
function nameOf(file: { row: { data: Prisma.JsonValue } | null }): string {
  const data = (file.row?.data ?? {}) as Record<string, string>;
  return (data.name ?? '').trim();
}

/**
 * Число для pg_advisory_xact_lock из идентификатора организации.
 *
 * Повторяет расчёт из `GenerationService`, и это существенно: замок
 * защищает от одновременного выпуска и перевыпуска только пока обе
 * стороны берут один и тот же ключ. Меняя одно — меняйте оба.
 */
function lockKey(orgId: string): bigint {
  const digest = createHash('sha256').update(orgId).digest();
  return digest.readBigUInt64BE(0) >> 1n;
}
