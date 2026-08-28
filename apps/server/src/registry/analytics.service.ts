import { Injectable } from '@nestjs/common';
import type { EmailStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { registryWhere } from './registry-filter';
import type { RegistryFilterDto } from './registry.dto';

/** Сколько материалов показываем в разбивке. */
const TOP_DOCUMENTS = 10;

/**
 * Сводка по жизни выданных документов.
 *
 * Считается по тем же фильтрам, что и таблица: цифры под таблицей обязаны
 * относиться к тому, что в таблице видно, иначе они не значат ничего.
 *
 * Что мы намеренно НЕ считаем и почему. Мы обработчик персональных данных
 * по поручению организации, а не самостоятельный оператор. Всё, что здесь
 * есть, — счётчики по документам организации, и организация сама решает,
 * зачем они ей. Личных профилей получателей, географии проверок, устройств,
 * повторных визитов одного и того же проверяющего мы не собираем и завести
 * не можем: это уже наблюдение за людьми в наших собственных интересах,
 * и оно перевело бы нас в статус оператора со всей полнотой ответственности
 * по 152-ФЗ.
 */
@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(orgId: string, filter: RegistryFilterDto) {
    const where = registryWhere(orgId, filter);

    const [totals, revoked, replaced, verifiedFiles, downloadedFiles, mail, byDocument] =
      await Promise.all([
        this.prisma.file.aggregate({
          where,
          _count: { _all: true },
          _sum: { verifyCount: true, downloadCount: true },
        }),
        this.prisma.file.count({ where: { ...where, verifyRevoked: true } }),
        this.prisma.file.count({ where: { ...where, replacedById: { not: null } } }),
        this.prisma.file.count({ where: { ...where, verifyCount: { gt: 0 } } }),
        this.prisma.file.count({ where: { ...where, downloadCount: { gt: 0 } } }),
        this.prisma.email.groupBy({
          by: ['status'],
          where: { orgId, file: where },
          _count: { _all: true },
        }),
        this.prisma.file.groupBy({
          by: ['documentId'],
          where,
          _count: { _all: true },
          _sum: { verifyCount: true },
          orderBy: { _count: { documentId: 'desc' } },
          take: TOP_DOCUMENTS,
        }),
      ]);

    const byStatus = new Map(mail.map((m) => [m.status, m._count._all]));
    const count = (...statuses: EmailStatus[]) =>
      statuses.reduce((sum, s) => sum + (byStatus.get(s) ?? 0), 0);

    const documentIds = byDocument
      .map((d) => d.documentId)
      .filter((id): id is string => id !== null);
    const documents = await this.prisma.document.findMany({
      where: { id: { in: documentIds }, orgId },
      select: { id: true, title: true, eventName: true },
    });
    const titles = new Map(documents.map((d) => [d.id, d]));

    return {
      issued: totals._count._all,
      revoked,
      replaced,
      /*
       * Воронка письма считается нарастающим итогом, а не по текущему
       * состоянию: прочитанное письмо когда-то было и отправленным,
       * и доставленным, но состояние у него одно — последнее. Показать
       * «отправлено 3, прочитано 47» значило бы напугать человека
       * несуществующей поломкой.
       *
       * Не доставленное (bounced) в отправленные входит: оно ушло
       * и вернулось. Не отправившееся (failed) — нет.
       */
      mail: {
        queued: count('queued'),
        sent: count('sent', 'delivered', 'opened', 'bounced'),
        delivered: count('delivered', 'opened'),
        opened: count('opened'),
        bounced: count('bounced'),
        failed: count('failed'),
      },
      downloads: { total: totals._sum.downloadCount ?? 0, files: downloadedFiles },
      /*
       * Главная цифра раздела. «Ваш сертификат проверили 47 раз» — это
       * единственное прямое свидетельство, что выданный документ чего-то
       * стоит: его показывали, и его смотрели.
       */
      verifications: { total: totals._sum.verifyCount ?? 0, files: verifiedFiles },
      documents: byDocument.map((d) => ({
        documentId: d.documentId,
        title: d.documentId ? (titles.get(d.documentId)?.title ?? 'Материал удалён') : 'Без материала',
        eventName: d.documentId ? (titles.get(d.documentId)?.eventName ?? '') : '',
        issued: d._count._all,
        verifications: d._sum.verifyCount ?? 0,
      })),
    };
  }
}
