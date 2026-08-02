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

export const GENERATION_QUEUE = 'generation';

interface GenerationJobData {
  jobId: string;
}

/**
 * Фоновая генерация файлов.
 *
 * Задание живёт в Redis, поэтому переживает перезапуск приложения.
 * Одновременно обрабатывается одно задание: рядом на сервере работает база,
 * а Chromium — самый прожорливый по памяти компонент системы.
 */
@Injectable()
export class GenerationProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GenerationProcessor.name);
  private connection?: IORedis;
  private queue?: Queue<GenerationJobData>;
  private worker?: Worker<GenerationJobData>;

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
    this.queue = new Queue<GenerationJobData>(GENERATION_QUEUE, { connection: this.connection });

    if (!this.config.get('RUN_WORKER', { infer: true })) {
      this.logger.log('Воркер выключен в этом процессе (RUN_WORKER=false)');
      return;
    }

    this.worker = new Worker<GenerationJobData>(
      GENERATION_QUEUE,
      (job) => this.process(job.data.jobId),
      { connection: this.connection, concurrency: 1 },
    );
    this.worker.on('failed', (job, err) => {
      this.logger.error(`Задание ${job?.data.jobId} упало: ${err.message}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
    this.connection?.disconnect();
  }

  async enqueue(jobId: string): Promise<void> {
    await this.queue?.add('generate', { jobId }, { removeOnComplete: 50, removeOnFail: 100 });
  }

  private async process(jobId: string): Promise<void> {
    const job = await this.prisma.generationJob.findUnique({
      where: { id: jobId },
      include: { document: true },
    });
    if (!job) return;

    await this.prisma.generationJob.update({
      where: { id: jobId },
      data: { status: 'running', startedAt: new Date(), done: 0, failed: 0, error: null },
    });

    const rows = await this.prisma.recipientRow.findMany({
      where: { documentId: job.documentId, checked: true },
      orderBy: { position: 'asc' },
    });

    const secret = this.config.get('SESSION_SECRET', { infer: true });
    const format = job.format === 'jpg' ? 'jpg' : 'pdf';
    let done = 0;
    let failed = 0;

    for (const row of rows) {
      try {
        const token = createRenderToken(
          { jobId, rowId: row.id },
          secret,
          Math.floor(Date.now() / 1000),
        );
        const body = await this.renderer.render(
          token,
          job.document.pageWidthMm,
          job.document.pageHeightMm,
          format,
        );

        const file = await this.prisma.file.create({
          data: {
            orgId: job.orgId,
            documentId: job.documentId,
            jobId,
            kind: 'generated',
            s3Key: '',
            sizeBytes: body.length,
            mime: format === 'jpg' ? 'image/jpeg' : 'application/pdf',
            originalName: buildFileName(row.data as Record<string, string>, format),
          },
        });

        const s3Key = buildS3Key({
          orgId: job.orgId,
          documentId: job.documentId,
          jobId,
          kind: 'generated',
          fileId: file.id,
          ext: format === 'jpg' ? 'jpg' : 'pdf',
        });
        await this.storage.put(s3Key, body, file.mime);
        await this.prisma.file.update({ where: { id: file.id }, data: { s3Key } });
        await this.prisma.recipientRow.update({
          where: { id: row.id },
          data: { lastFileId: file.id },
        });

        done++;
      } catch (err) {
        // Одна плохая строка не должна ронять всё награждение:
        // считаем ошибки и продолжаем, отчёт покажем в интерфейсе.
        failed++;
        this.logger.warn(`Строка ${row.id}: ${err instanceof Error ? err.message : String(err)}`);
      }

      await this.prisma.generationJob.update({ where: { id: jobId }, data: { done, failed } });
    }

    await this.prisma.generationJob.update({
      where: { id: jobId },
      data: {
        status: failed === rows.length && rows.length > 0 ? 'failed' : 'done',
        finishedAt: new Date(),
        error: failed ? `Не удалось создать файлов: ${failed}` : null,
      },
    });
    this.logger.log(`Задание ${jobId}: создано ${done}, ошибок ${failed}`);
  }
}

/** Имя видит пользователь при скачивании, поэтому в нём должно быть имя получателя. */
function buildFileName(data: Record<string, string>, format: string): string {
  const name = (data.name ?? '').trim() || 'Документ';
  const safe = name.replace(/[\\/:*?"<>|]/g, ' ').slice(0, 80);
  return `${safe}.${format === 'jpg' ? 'jpg' : 'pdf'}`;
}
