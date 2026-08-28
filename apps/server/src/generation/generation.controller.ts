import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Logger,
  Param,
  Post,
  Query,
  Res,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FastifyReply } from 'fastify';
import * as archiver from 'archiver';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentUser } from '../common/current-user.decorator';
import { AuthGuard } from '../auth/auth.guard';
import type { SessionUser } from '../auth/auth.service';
import { uuidSchema } from '../documents/documents.dto';
import { StorageService } from '../storage/storage.service';
import { contentDisposition } from '../storage/s3-key';
import { AuditActor } from '../audit/actor.decorator';
import { AuditService, type Actor } from '../audit/audit.service';
import type { Env } from '../config/env';
import { GenerationService, isStuck } from './generation.service';
import { GenerationProcessor } from './generation.processor';
import { buildFileName, nameTemplateSchema, uniqueName } from './file-name';
import { mergePdfs } from './merge-pdf';

const uuidParam = new ZodValidationPipe(uuidSchema);
const startSchema = z.object({ format: z.enum(['pdf', 'jpg']).default('pdf') });
type StartDto = z.infer<typeof startSchema>;

/**
 * Как отдать готовый пакет.
 *
 * Здесь же точка расширения: письмом участникам, ссылкой на скачивание,
 * выгрузкой в облако, форматами DOCX и JPG. Каждый из этих способов —
 * отдельная работа со своими вопросами (кому и от кого слать, сколько
 * живёт ссылка, чей это диск), и подмешивать их к скачиванию нельзя.
 * Добавляются они сюда — значением в этой схеме и веткой в `archive`.
 */
const downloadSchema = z.object({
  format: z.enum(['zip', 'pdf']).default('zip'),
  /** Шаблон имени файла в архиве. Для общего PDF имена не нужны. */
  name: nameTemplateSchema.optional(),
});
type DownloadDto = z.infer<typeof downloadSchema>;

@Controller()
@UseGuards(AuthGuard)
export class GenerationController {
  private readonly logger = new Logger(GenerationController.name);

  constructor(
    private readonly generation: GenerationService,
    private readonly processor: GenerationProcessor,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Post('documents/:id/generate')
  async start(
    @CurrentUser() user: SessionUser,
    @AuditActor() actor: Actor,
    @Param('id', uuidParam) id: string,
    @Body(new ZodValidationPipe(startSchema)) dto: StartDto,
  ) {
    const { job, rowIds } = await this.generation.start(user.orgId, id, dto.format);
    const chunks = await this.enqueueOrFail(job, rowIds);

    await this.audit.record({
      actor,
      action: 'generation.start',
      summary: `Выпуск документов: ${job.total}`,
      targetType: 'document',
      targetId: id,
      meta: { jobId: job.id, format: dto.format, total: job.total, chunks },
    });

    return job;
  }

  /**
   * Продолжить прерванный выпуск с того места, где он встал.
   *
   * Отдельно от «Создать документы» намеренно. Новый выпуск — это новое
   * задание и новая оплата: человек мог исправить список и хотеть второй
   * комплект. Продолжение же доделывает то же самое задание, и за уже
   * созданные документы второй раз не платят.
   */
  @Post('jobs/:jobId/resume')
  async resume(
    @CurrentUser() user: SessionUser,
    @AuditActor() actor: Actor,
    @Param('jobId', uuidParam) jobId: string,
  ) {
    const { job, rowIds } = await this.generation.resume(user.orgId, jobId);
    if (rowIds.length > 0) await this.enqueueOrFail(job, rowIds);

    await this.audit.record({
      actor,
      action: 'generation.resume',
      summary: `Выпуск продолжен: осталось ${rowIds.length} из ${job.total}`,
      targetType: 'document',
      targetId: job.documentId,
      meta: { jobId: job.id, left: rowIds.length, attempt: job.attempt },
    });

    return job;
  }

  /**
   * Отмена начатого выпуска.
   *
   * Уже созданные документы остаются: человек отменяет остаток, а не
   * отказывается от сделанного. Квота за ненапечатанные строки не списана —
   * списывается она в момент создания файла, а не при постановке задания.
   */
  @Post('jobs/:jobId/cancel')
  async cancel(
    @CurrentUser() user: SessionUser,
    @AuditActor() actor: Actor,
    @Param('jobId', uuidParam) jobId: string,
  ) {
    const { job, refunded } = await this.generation.cancel(user.orgId, jobId);
    // Части, до которых воркер не добрался, снимаем с очереди: иначе они
    // допечатали бы документы, от оплаты которых человек только что отказался.
    await this.processor.dequeue(jobId, job.attempt, job.chunks);

    await this.audit.record({
      actor,
      action: 'generation.cancel',
      summary: `Выпуск отменён: создано ${job.done} из ${job.total}`,
      targetType: 'document',
      targetId: job.documentId,
      meta: { jobId: job.id, done: job.done, refunded },
    });

    return { ...job, refunded };
  }

  /**
   * Ставит пакет в очередь и следит, чтобы неудача не осталась незамеченной.
   *
   * Запись о задании уже в базе — она коммитится раньше постановки. Если
   * очередь не приняла пакет, а мы просто вернём ошибку, задание навсегда
   * останется «в очереди»: вечный прогресс на экране, занятая бронь квоты,
   * заблокированный материал. Поэтому сначала закрываем задание,
   * и только потом отвечаем.
   */
  private async enqueueOrFail(
    job: { id: string; total: number; attempt: number },
    rowIds: string[],
  ): Promise<number> {
    try {
      return await this.processor.enqueue(job, rowIds);
    } catch (err) {
      this.logger.error(
        `Не удалось поставить задание ${job.id} в очередь: ` +
          `${err instanceof Error ? err.message : String(err)}`,
      );
      await this.generation.failToQueue(job.id);
      throw new ServiceUnavailableException(
        'Очередь заданий сейчас недоступна, выпуск не начат. ' +
          'Ничего не списано — попробуйте ещё раз через минуту.',
      );
    }
  }

  @Get('documents/:id/jobs')
  listJobs(@CurrentUser() user: SessionUser, @Param('id', uuidParam) id: string) {
    return this.generation.listJobs(user.orgId, id);
  }

  /**
   * Состояние задания для экрана выпуска.
   *
   * К записи добавлен признак «зависло»: задание может честно стоять
   * в очереди, а может стоять в ней навсегда, и по одному лишь статусу
   * `queued` человек эти два случая не различит. Считаем на сервере —
   * в кабинете нет ни времени создания, ни правила, по которому срок
   * ожидания считается неразумным.
   */
  @Get('jobs/:jobId')
  async getJob(@CurrentUser() user: SessionUser, @Param('jobId', uuidParam) jobId: string) {
    const job = await this.generation.getJob(user.orgId, jobId);
    return { ...job, stuck: isStuck(job) };
  }

  /**
   * Кого выпуск не осилил и почему — поимённо.
   *
   * Число «ошибок 12» заставляет сверять список руками: по нему не понять
   * даже, пропали это строки из таблицы или не отрисовались документы.
   */
  @Get('jobs/:jobId/failures')
  failures(@CurrentUser() user: SessionUser, @Param('jobId', uuidParam) jobId: string) {
    return this.generation.jobFailures(user.orgId, jobId);
  }

  /**
   * Что можно сделать с готовым пакетом прямо сейчас.
   *
   * Нужно до нажатия, а не после: единый PDF собирается в памяти, и большому
   * пакету в ней не поместиться. Узнать об этом отказом в новой вкладке —
   * значит получить голый JSON вместо файла и никакого объяснения.
   */
  @Get('jobs/:jobId/download-options')
  async downloadOptions(
    @CurrentUser() user: SessionUser,
    @Param('jobId', uuidParam) jobId: string,
  ) {
    const files = await this.generation.jobFiles(user.orgId, jobId);
    const pdfs = files.filter((f) => f.mime === 'application/pdf');
    const sizeBytes = pdfs.reduce((sum, f) => sum + f.sizeBytes, 0);

    return {
      count: files.length,
      pdfCount: pdfs.length,
      sizeBytes,
      print: this.printVerdict(pdfs.length, sizeBytes),
    };
  }

  /**
   * Готовый пакет: архивом или одним PDF на печать.
   *
   * Скачивание ничего не выпускает и потому не трогает квоту: списывается
   * она в момент создания файла. Иначе человек, скачавший архив дважды,
   * заплатил бы за свои же документы два раза.
   */
  @Get('jobs/:jobId/archive')
  async archive(
    @CurrentUser() user: SessionUser,
    @Param('jobId', uuidParam) jobId: string,
    @Query(new ZodValidationPipe(downloadSchema)) query: DownloadDto,
    @Res() reply: FastifyReply,
  ) {
    const files = await this.generation.jobFiles(user.orgId, jobId);

    if (query.format === 'pdf') {
      return this.sendPrintPdf(files, reply);
    }
    return this.sendZip(files, query.name ?? null, reply);
  }

  /**
   * Архив со всеми файлами задания. Собирается потоком: класть сотни PDF
   * в память или во временные файлы на диске не нужно.
   *
   * Без шаблона имя берётся то, под которым файл выпущен. Это не то же самое,
   * что шаблон по умолчанию: у выпущенных до появления шаблонов файлов
   * строки-источника уже нет, и собирать имя было бы не из чего — весь
   * старый архив приехал бы пачкой «Документ (2).pdf».
   */
  private async sendZip(
    files: JobFile[],
    template: string | null,
    reply: FastifyReply,
  ): Promise<void> {
    const zip = new archiver.ZipArchive({ zlib: { level: 6 } });
    reply
      .header('content-type', 'application/zip')
      .header('content-disposition', contentDisposition('Сертификаты.zip'))
      .send(zip);

    const used = new Set<string>();
    let number = 1;
    for (const file of files) {
      const name = uniqueName(used, entryName(file, template, number++));
      zip.append(await this.storage.getStream(file.s3Key), { name });
    }
    await zip.finalize();
  }

  /**
   * Один PDF на всю пачку.
   *
   * Печать трёхсот отдельных файлов — это триста раз «Открыть» и «Печать»
   * либо разговор с системным администратором про пакетную печать.
   * Один файл на триста страниц отправляется на принтер один раз.
   *
   * В отличие от архива, склейка не стримится: pdf-lib разбирает каждый
   * исходник целиком, держит собранный документ в памяти и делает из него
   * ещё один буфер при сохранении. У контейнера приложения гигабайт на всех
   * пользователей сразу, поэтому предел жёсткий и проверяется дважды —
   * здесь и в кабинете, до нажатия.
   */
  private async sendPrintPdf(files: JobFile[], reply: FastifyReply): Promise<void> {
    const pdfs = files.filter((f) => f.mime === 'application/pdf');
    const sizeBytes = pdfs.reduce((sum, f) => sum + f.sizeBytes, 0);
    const verdict = this.printVerdict(pdfs.length, sizeBytes);
    if (!verdict.allowed) throw new BadRequestException(verdict.reason);

    const sources: Buffer[] = [];
    for (const file of pdfs) {
      sources.push(await streamToBuffer(await this.storage.getStream(file.s3Key)));
    }

    const merged = await mergePdfs(sources).catch(() => null);
    if (!merged) {
      throw new BadRequestException(
        'Не удалось собрать общий файл: документы этого задания не читаются как PDF',
      );
    }
    if (merged.skipped > 0) {
      this.logger.warn(`Общий PDF: пропущено нечитаемых файлов ${merged.skipped}`);
    }

    reply
      .header('content-type', 'application/pdf')
      .header('content-disposition', contentDisposition('Сертификаты на печать.pdf'))
      .send(merged.pdf);
  }

  /** Помещается ли пачка в один файл — и если нет, то что об этом сказать. */
  private printVerdict(
    count: number,
    sizeBytes: number,
  ): { allowed: boolean; reason: string | null; limitFiles: number; limitMb: number } {
    const limitFiles = this.config.get('PRINT_MERGE_LIMIT_FILES', { infer: true });
    const limitMb = this.config.get('PRINT_MERGE_LIMIT_MB', { infer: true });
    const sizeMb = sizeBytes / (1024 * 1024);
    const base = { limitFiles, limitMb };

    if (count === 0) {
      return {
        ...base,
        allowed: false,
        reason: 'В этом выпуске нет ни одного PDF — общий файл собрать не из чего.',
      };
    }
    if (count > limitFiles) {
      return {
        ...base,
        allowed: false,
        reason:
          `Документов слишком много для одного файла: ${count} при пределе ${limitFiles}. ` +
          `Скачайте архивом — в нём тот же комплект.`,
      };
    }
    if (sizeMb > limitMb) {
      return {
        ...base,
        allowed: false,
        reason:
          `Пачка слишком тяжёлая для одного файла: ${Math.round(sizeMb)} МБ при пределе ` +
          `${limitMb} МБ. Скачайте архивом — в нём тот же комплект.`,
      };
    }
    return { ...base, allowed: true, reason: null };
  }
}

/** Файл задания вместе со строкой, из которой собирается имя. */
interface JobFile {
  s3Key: string;
  mime: string;
  sizeBytes: number;
  publicId: string;
  originalName: string;
  row: { data: unknown } | null;
}

/** Имя записи в архиве: по шаблону, если он задан, иначе то, под которым выпущен. */
function entryName(file: JobFile, template: string | null, number: number): string {
  const ext = file.mime === 'image/jpeg' ? 'jpg' : 'pdf';
  if (!template) return file.originalName || `Документ.${ext}`;

  const data = file.row?.data;
  return buildFileName(
    template,
    data && typeof data === 'object' ? (data as Record<string, string>) : {},
    { number, publicId: file.publicId, ext },
  );
}

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
