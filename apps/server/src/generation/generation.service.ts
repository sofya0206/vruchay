import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class GenerationService {
  constructor(private readonly prisma: PrismaService) {}

  /** Создаёт задание на отмеченные строки. Сама генерация идёт в воркере. */
  async start(orgId: string, documentId: string, format: 'pdf' | 'jpg') {
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

    const total = await this.prisma.recipientRow.count({
      where: { documentId, checked: true },
    });
    if (total === 0) {
      throw new BadRequestException('Не отмечено ни одной строки в таблице получателей');
    }

    const running = await this.prisma.generationJob.findFirst({
      where: { documentId, status: { in: ['queued', 'running'] } },
    });
    if (running) {
      throw new BadRequestException('Генерация по этому документу уже идёт');
    }

    return this.prisma.generationJob.create({
      data: { orgId, documentId, format, total },
    });
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

  /** Файлы задания — для скачивания архивом. */
  async jobFiles(orgId: string, jobId: string) {
    await this.getJob(orgId, jobId);
    return this.prisma.file.findMany({
      where: { jobId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
  }
}
