import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ReferralService } from '../referral/referral.service';

@Injectable()
export class GenerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly referral: ReferralService,
  ) {}

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

    await this.checkFreeLimit(orgId, total);

    return this.prisma.generationJob.create({
      data: { orgId, documentId, format, total },
    });
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
   * Проверяем до постановки задания: узнать об исчерпанном лимите на сорок
   * седьмом документе из пятидесяти — это уже испорченное награждение.
   */
  private async checkFreeLimit(orgId: string, adding: number): Promise<void> {
    const org = await this.prisma.organization.findUnique({ where: { id: orgId } });
    if (!org || org.plan !== 'free') return;

    const base = Number(process.env.FREE_DOCUMENT_LIMIT ?? 50);
    // Заработанное приглашениями прибавляется к пробе. Считается по фактам,
    // а не по счётчику, — см. ReferralService.
    const bonus = await this.referral.bonusDocuments(orgId);
    const limit = base + bonus;
    const used = await this.prisma.file.count({ where: { orgId, kind: 'generated' } });

    if (used + adding > limit) {
      const left = Math.max(0, limit - used);
      // Про приглашения говорим только тем, у кого проба на исходе: раньше
      // это выглядело бы навязыванием, а здесь это ответ на их вопрос
      // «что делать дальше».
      const hint =
        ` Или пригласите коллегу в разделе «Пригласить друга» — за каждого, ` +
        `кто начнёт работать, добавим ещё документов.`;
      throw new BadRequestException(
        left === 0
          ? `Бесплатная проба закончилась: выпущено ${used} документов из ${limit}. ` +
            `Чтобы продолжить, выберите тариф на vruchay.ru.${hint}`
          : `На бесплатной пробе осталось ${left} документов из ${limit}, ` +
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

  /** Файлы задания — для скачивания архивом. */
  async jobFiles(orgId: string, jobId: string) {
    await this.getJob(orgId, jobId);
    return this.prisma.file.findMany({
      where: { jobId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
  }
}
