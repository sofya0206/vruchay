import type { OrgPlan } from '@prisma/client';
import type { PrismaService } from '../../../src/prisma/prisma.service';

/**
 * Заготовки данных для тестов слоя.
 *
 * Всё пишется настоящей Prisma в настоящую базу: подмены здесь нет
 * и быть не должно — иначе проверять было бы нечего.
 */

/** Макет листа: тот же формат, что редактор кладёт в `sheets.layout`. */
export function certificateLayout() {
  return [
    {
      id: 'title',
      type: 'text',
      x: 20,
      y: 40,
      w: 257,
      h: 20,
      props: { text: 'Награждается', fontSize: 20 },
    },
    {
      id: 'name',
      type: 'text',
      x: 20,
      y: 70,
      w: 257,
      h: 24,
      // Дательный падеж считает сервис из колонки «name» — ровно это
      // и надо увидеть в готовом PDF.
      props: { text: '%name_dat', fontSize: 28, bold: true },
    },
    {
      id: 'event',
      type: 'text',
      x: 20,
      y: 105,
      w: 257,
      h: 16,
      props: { text: '%event, %event_date', fontSize: 14 },
    },
    {
      id: 'code',
      type: 'qr',
      x: 250,
      y: 160,
      w: 30,
      h: 30,
      props: { template: '' },
    },
  ];
}

export async function makeOrg(
  prisma: PrismaService,
  options: { name?: string; plan?: OrgPlan } = {},
) {
  return prisma.organization.create({
    data: { name: options.name ?? 'Федерация проверки', plan: options.plan ?? 'paid' },
  });
}

export async function makeDocument(
  prisma: PrismaService,
  orgId: string,
  options: {
    title?: string;
    layout?: unknown;
    eventName?: string;
    eventDate?: string;
    verifyEnabled?: boolean;
    verifyFields?: string[];
  } = {},
) {
  return prisma.document.create({
    data: {
      orgId,
      title: options.title ?? 'Грамота',
      eventName: options.eventName ?? 'Первенство области по плаванию',
      eventDate: options.eventDate ?? '17–19 июня 2026 года',
      verifyEnabled: options.verifyEnabled ?? true,
      verifyFields: options.verifyFields ?? ['name'],
      sheets: {
        create: {
          position: 0,
          layout: (options.layout ?? certificateLayout()) as never,
        },
      },
      columns: {
        create: [
          { position: 0, name: 'name' },
          { position: 1, name: 'email' },
        ],
      },
    },
    include: { sheets: true },
  });
}

/** Строки получателей по порядку, все отмеченные. */
export async function makeRows(
  prisma: PrismaService,
  documentId: string,
  rows: Record<string, string>[],
  { checked = true }: { checked?: boolean } = {},
) {
  await prisma.recipientRow.createMany({
    data: rows.map((data, position) => ({ documentId, position, data, checked })),
  });
  return prisma.recipientRow.findMany({ where: { documentId }, orderBy: { position: 'asc' } });
}

/**
 * Выданный документ прямо в базе.
 *
 * Там, где проверяется не выпуск, а то, что с выданным потом делают —
 * права, реестр, страница проверки, — гонять ради каждой записи очередь
 * и браузер незачем: путь выпуска целиком проверяет `flow.int.test.ts`.
 */
export async function makeIssuedFile(
  prisma: PrismaService,
  options: { orgId: string; documentId: string; rowId?: string; jobId?: string; createdAt?: Date },
) {
  return prisma.file.create({
    data: {
      orgId: options.orgId,
      documentId: options.documentId,
      rowId: options.rowId ?? null,
      jobId: options.jobId ?? null,
      kind: 'generated',
      s3Key: `${options.orgId}/${options.documentId}/${Date.now()}-${Math.round(Math.random() * 1e9)}.pdf`,
      sizeBytes: 1024,
      mime: 'application/pdf',
      originalName: 'Грамота.pdf',
      ...(options.createdAt ? { createdAt: options.createdAt } : {}),
    },
  });
}

/** Много выданных документов разом — для проверок на объёме. */
export async function makeManyIssuedFiles(
  prisma: PrismaService,
  options: { orgId: string; documentId: string; count: number; startAt?: Date },
): Promise<number> {
  const start = (options.startAt ?? new Date(Date.UTC(2026, 0, 1))).getTime();
  const { count } = await prisma.file.createMany({
    data: Array.from({ length: options.count }, (_, i) => ({
      orgId: options.orgId,
      documentId: options.documentId,
      kind: 'generated' as const,
      s3Key: `${options.orgId}/${options.documentId}/bulk-${i}.pdf`,
      sizeBytes: 1024,
      mime: 'application/pdf',
      originalName: `Грамота ${i + 1}.pdf`,
      // Разное время выпуска: реестр листает по нему, и одинаковая
      // отметка у всех строк сделала бы порядок страниц неопределённым.
      createdAt: new Date(start + i * 1000),
    })),
  });
  return count;
}
