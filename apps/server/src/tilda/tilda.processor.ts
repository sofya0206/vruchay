import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { buildS3Key } from '../storage/s3-key';
import { createRenderToken } from '../render/render-token';
import { PdfRenderer } from '../generation/pdf-renderer';
import { MailService } from '../mail/mail.service';
import { MailProcessor } from '../mail/mail.processor';
import { isValidEmail } from '../mail/mail-template';
import { maskEmail, redact } from '../common/redact';
import type { Env } from '../config/env';

export const TILDA_QUEUE = 'tilda';

interface TildaJobData {
  requestId: string;
}

/**
 * Выдача документа по заявке с публичной формы.
 *
 * Очередь отдельная от массовой генерации: человек стоит у экрана и ждёт,
 * поэтому его заявка не должна дожидаться конца пакета на пятьсот строк.
 * Chromium при этом общий и отрисовывает по одной странице за раз — заявка
 * встаёт между строками пакета, а не после него.
 */
@Injectable()
export class TildaProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TildaProcessor.name);
  private connection?: IORedis;
  private queue?: Queue<TildaJobData>;
  private worker?: Worker<TildaJobData>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly config: ConfigService<Env, true>,
    private readonly renderer: PdfRenderer,
    private readonly mail: MailService,
    private readonly mailQueue: MailProcessor,
  ) {}

  onModuleInit(): void {
    this.connection = new IORedis(this.config.get('REDIS_URL', { infer: true }), {
      maxRetriesPerRequest: null,
    });
    this.queue = new Queue<TildaJobData>(TILDA_QUEUE, { connection: this.connection });

    if (!this.config.get('RUN_WORKER', { infer: true })) return;

    this.worker = new Worker<TildaJobData>(
      TILDA_QUEUE,
      (job) => this.process(job.data.requestId, isLastAttempt(job)),
      { connection: this.connection, concurrency: 2 },
    );
    this.worker.on('failed', (job, err) => {
      this.logger.error(`Заявка ${job?.data.requestId}: ${redact(err.message)}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
    this.connection?.disconnect();
  }

  async enqueue(requestId: string): Promise<void> {
    await this.queue?.add(
      'issue',
      { requestId },
      {
        // Сбой браузера или моргнувшее хранилище не должны стоить человеку
        // документа: он уже подтвердил адрес и ждёт письма.
        attempts: 3,
        backoff: { type: 'exponential', delay: 3000 },
        removeOnComplete: 200,
        removeOnFail: 500,
      },
    );
  }

  private async process(requestId: string, lastAttempt: boolean): Promise<void> {
    const request = await this.prisma.tildaRequest.findUnique({
      where: { id: requestId },
      include: { integration: true },
    });
    // Заявку могли уже обработать — повтор не нужен.
    if (!request || request.status !== 'processing') return;

    const data = { ...(request.fields as Record<string, string>), email: request.email };

    try {
      // Файл и письмо запоминаются сразу, по отдельности: если повтор
      // случится между двумя шагами, участник не получит второй документ
      // и второе письмо.
      let fileId = request.fileId;
      if (!fileId) {
        fileId = await this.issue(request.id, request.orgId, request.documentId, data);
        await this.prisma.tildaRequest.update({ where: { id: requestId }, data: { fileId } });
      }

      let emailId = request.emailId;
      if (!emailId && request.integration.sendEmail) {
        emailId = await this.deliver(request.orgId, request.documentId, request.email, data, fileId);
        await this.prisma.tildaRequest.update({ where: { id: requestId }, data: { emailId } });

        // Копия организатору: он видит, что и кому ушло, не заходя в кабинет.
        const copyTo = request.integration.copyToEmail?.trim();
        if (copyTo && isValidEmail(copyTo)) {
          // Копия — удобство организатора, а не обязательство перед участником:
          // её сбой не должен превращать выданный документ в неудачную заявку.
          await this.deliver(request.orgId, request.documentId, copyTo, data, fileId).catch(
            (err: unknown) => {
              this.logger.warn(`Копия по заявке ${requestId} не ушла: ${redact(String(err))}`);
            },
          );
        }
      }

      await this.prisma.tildaRequest.update({
        where: { id: requestId },
        data: { status: 'done', doneAt: new Date(), error: null },
      });
      this.logger.log(`Заявка ${requestId}: документ выдан для ${maskEmail(request.email)}`);
    } catch (err) {
      const message = redact(err instanceof Error ? err.message : String(err));
      this.logger.error(`Заявка ${requestId} не выполнена: ${message}`);
      // Заявка помечается неудачной только когда попытки кончились: иначе
      // повтор увидел бы статус «failed» и молча ничего не сделал.
      if (lastAttempt) {
        await this.prisma.tildaRequest.update({
          where: { id: requestId },
          data: { status: 'failed', error: message.slice(0, 500) },
        });
      }
      throw err;
    }
  }

  /**
   * Отрисовка одного документа.
   *
   * Участник добавляется строкой в таблицу получателей документа — так
   * организатор видит выданное через форму рядом с обычными награждениями.
   * Строка не отмечена: иначе следующая массовая генерация переделала бы
   * документы всем, кто когда-либо заполнял форму.
   */
  private async issue(
    requestId: string,
    orgId: string,
    documentId: string,
    data: Record<string, string>,
  ): Promise<string> {
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, orgId, deletedAt: null },
    });
    if (!document) throw new Error('Документ не найден или удалён');

    const row = await this.createRow(documentId, data);
    const job = await this.prisma.generationJob.create({
      data: {
        orgId,
        documentId,
        format: 'pdf',
        total: 1,
        status: 'running',
        startedAt: new Date(),
      },
    });

    const token = createRenderToken(
      { jobId: job.id, rowId: row.id },
      this.config.get('SESSION_SECRET', { infer: true }),
      Math.floor(Date.now() / 1000),
    );
    const body = await this.renderer.render(
      token,
      document.pageWidthMm,
      document.pageHeightMm,
      'pdf',
    );

    const file = await this.prisma.file.create({
      data: {
        orgId,
        documentId,
        jobId: job.id,
        kind: 'generated',
        s3Key: '',
        sizeBytes: body.length,
        mime: 'application/pdf',
        originalName: buildFileName(data),
      },
    });
    const s3Key = buildS3Key({
      orgId,
      documentId,
      jobId: job.id,
      kind: 'generated',
      fileId: file.id,
      ext: 'pdf',
    });
    await this.storage.put(s3Key, body, file.mime);

    await this.prisma.$transaction([
      this.prisma.file.update({ where: { id: file.id }, data: { s3Key } }),
      this.prisma.recipientRow.update({ where: { id: row.id }, data: { lastFileId: file.id } }),
      this.prisma.generationJob.update({
        where: { id: job.id },
        data: { status: 'done', done: 1, finishedAt: new Date() },
      }),
    ]);

    this.logger.log(`Заявка ${requestId}: файл ${file.id} создан`);
    return file.id;
  }

  /**
   * Номер строки уникален в пределах документа, а таблицу в это же время
   * может править человек в кабинете. Поэтому на столкновение — повтор
   * с пересчитанным номером, а не падение заявки.
   */
  private async createRow(documentId: string, data: Record<string, string>) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const last = await this.prisma.recipientRow.findFirst({
        where: { documentId },
        orderBy: { position: 'desc' },
        select: { position: true },
      });
      try {
        return await this.prisma.recipientRow.create({
          data: { documentId, position: (last?.position ?? -1) + 1, data, checked: false },
        });
      } catch (err) {
        if (attempt === 4) throw err;
      }
    }
    throw new Error('Не удалось добавить строку в таблицу получателей');
  }

  private async deliver(
    orgId: string,
    documentId: string,
    to: string,
    data: Record<string, string>,
    fileId: string,
  ): Promise<string> {
    const emailId = await this.mail.queueSingle(orgId, documentId, to, data, fileId);
    await this.mailQueue.enqueue(emailId);
    return emailId;
  }
}

/**
 * Последняя ли это попытка. Разные версии очереди считают попытки по-разному
 * (до или после увеличения счётчика), поэтому сравнение нестрогое: ошибиться
 * лучше в сторону лишнего повтора, чем преждевременно закрыть заявку.
 */
function isLastAttempt(job: { attemptsMade: number; opts: { attempts?: number } }): boolean {
  return job.attemptsMade >= (job.opts.attempts ?? 1) - 1;
}

/** Имя файла видит участник при скачивании — в нём должно быть его имя. */
function buildFileName(data: Record<string, string>): string {
  const name = (data.name ?? '').trim() || 'Документ';
  return `${name.replace(/[\\/:*?"<>|]/g, ' ').slice(0, 80)}.pdf`;
}
