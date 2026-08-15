import { Body, Controller, Get, Param, Post, Res, UseGuards } from '@nestjs/common';
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
import { GenerationService } from './generation.service';
import { GenerationProcessor } from './generation.processor';

const uuidParam = new ZodValidationPipe(uuidSchema);
const startSchema = z.object({ format: z.enum(['pdf', 'jpg']).default('pdf') });
type StartDto = z.infer<typeof startSchema>;

@Controller()
@UseGuards(AuthGuard)
export class GenerationController {
  constructor(
    private readonly generation: GenerationService,
    private readonly processor: GenerationProcessor,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  @Post('documents/:id/generate')
  async start(
    @CurrentUser() user: SessionUser,
    @AuditActor() actor: Actor,
    @Param('id', uuidParam) id: string,
    @Body(new ZodValidationPipe(startSchema)) dto: StartDto,
  ) {
    const job = await this.generation.start(user.orgId, id, dto.format);
    await this.processor.enqueue(job.id);

    await this.audit.record({
      actor,
      action: 'generation.start',
      summary: `Выпуск документов: ${job.total}`,
      targetType: 'document',
      targetId: id,
      meta: { jobId: job.id, format: dto.format, total: job.total },
    });

    return job;
  }

  @Get('documents/:id/jobs')
  listJobs(@CurrentUser() user: SessionUser, @Param('id', uuidParam) id: string) {
    return this.generation.listJobs(user.orgId, id);
  }

  @Get('jobs/:jobId')
  getJob(@CurrentUser() user: SessionUser, @Param('jobId', uuidParam) jobId: string) {
    return this.generation.getJob(user.orgId, jobId);
  }

  /**
   * Архив со всеми файлами задания. Собирается потоком: класть сотни PDF
   * в память или во временные файлы на диске не нужно.
   */
  @Get('jobs/:jobId/archive')
  async archive(
    @CurrentUser() user: SessionUser,
    @Param('jobId', uuidParam) jobId: string,
    @Res() reply: FastifyReply,
  ) {
    const files = await this.generation.jobFiles(user.orgId, jobId);

    const zip = new archiver.ZipArchive({ zlib: { level: 6 } });
    reply
      .header('content-type', 'application/zip')
      .header('content-disposition', contentDisposition('Сертификаты.zip'))
      .send(zip);

    const used = new Set<string>();
    for (const file of files) {
      // Тёзки среди участников — обычное дело, а в архиве имена должны быть разными.
      let name = file.originalName || `${file.id}.pdf`;
      let n = 2;
      while (used.has(name)) {
        const dot = name.lastIndexOf('.');
        const base = dot > 0 ? name.slice(0, dot) : name;
        const ext = dot > 0 ? name.slice(dot) : '';
        name = `${base} (${n++})${ext}`;
      }
      used.add(name);
      zip.append(await this.storage.getStream(file.s3Key), { name });
    }
    await zip.finalize();
  }
}
