import { describe, expect, it } from 'vitest';
import { DocumentsService } from './documents.service';

/**
 * Срок хранения корзины держит организация, а не общая константа.
 *
 * До этой правки ночная уборка сносила всё старше семи дней у всех сразу.
 * Организация — оператор своих данных и сама решает срок (ч. 7 ст. 5
 * 152-ФЗ): федерации хватает трёх дней, вузу нужен месяц.
 */
interface Doc {
  id: string;
  deletedAt: Date | null;
  trashDays?: number;
}

const NOW = new Date('2026-09-03T12:00:00.000Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);

function serviceWith(docs: Doc[]) {
  const purged: string[] = [];
  const prisma = {
    document: {
      findMany: async () =>
        docs.map((d) => ({
          id: d.id,
          deletedAt: d.deletedAt,
          org: d.trashDays === undefined ? null : { trashDays: d.trashDays },
        })),
      delete: async ({ where }: { where: { id: string } }) => void purged.push(where.id),
    },
    file: { findMany: async () => [], deleteMany: async () => ({ count: 0 }) },
  };
  const storage = { remove: async () => undefined };
  return { service: new DocumentsService(prisma as never, storage as never), purged };
}

describe('уборка корзины по сроку организации', () => {
  it('короткий срок организации убирает раньше общего', async () => {
    const { service, purged } = serviceWith([{ id: 'быстрый', deletedAt: daysAgo(4), trashDays: 3 }]);
    await service.purgeExpired(daysAgo(7), NOW);
    expect(purged).toEqual(['быстрый']);
  });

  it('длинный срок организации держит материал дольше общего', async () => {
    const { service, purged } = serviceWith([{ id: 'долгий', deletedAt: daysAgo(10), trashDays: 30 }]);
    await service.purgeExpired(daysAgo(7), NOW);
    expect(purged).toEqual([]);
  });

  it('в день истечения срока материал уходит, накануне остаётся', async () => {
    const { service, purged } = serviceWith([
      { id: 'ровно', deletedAt: daysAgo(7), trashDays: 7 },
      { id: 'ещё нет', deletedAt: daysAgo(6), trashDays: 7 },
    ]);
    await service.purgeExpired(daysAgo(7), NOW);
    expect(purged).toEqual(['ровно']);
  });

  it('материал без организации падает на общий срок, а не остаётся навсегда', async () => {
    const { service, purged } = serviceWith([{ id: 'ничей', deletedAt: daysAgo(9) }]);
    await service.purgeExpired(daysAgo(7), NOW);
    expect(purged).toEqual(['ничей']);
  });

  it('живой материал не трогает: у него нет отметки удаления', async () => {
    const { service, purged } = serviceWith([{ id: 'живой', deletedAt: null, trashDays: 1 }]);
    await service.purgeExpired(daysAgo(7), NOW);
    expect(purged).toEqual([]);
  });
});
