import { describe, expect, it } from 'vitest';
import { ReplacementService, type PendingReplacement } from './replacement.service';

const ORG = 'org-1';

interface Stub {
  /** Файлы, выпущенные заданием перевыпуска. */
  fresh: { id: string; jobId: string; rowId: string | null }[];
  jobs: { id: string; status: string }[];
}

/** Что записали в базу — по этому и проверяем поведение. */
type Written = Record<string, { replacedById?: string; replacedByJobId?: null }>;

function serviceWith(stub: Stub): { service: ReplacementService; written: Written } {
  const written: Written = {};
  const prisma = {
    file: {
      findMany: async () => stub.fresh,
      update: async ({ where, data }: { where: { id: string }; data: object }) => {
        written[where.id] = data;
        return {};
      },
    },
    generationJob: { findMany: async () => stub.jobs },
  };
  return { service: new ReplacementService(prisma as never), written };
}

const waiting: PendingReplacement = {
  id: 'old',
  orgId: ORG,
  rowId: 'row-1',
  replacedByJobId: 'job-1',
  replacedById: null,
};

describe('подтверждение перевыпуска', () => {
  it('связывает старый документ с новым, когда тот выпущен', async () => {
    const { service, written } = serviceWith({
      fresh: [{ id: 'new', jobId: 'job-1', rowId: 'row-1' }],
      jobs: [{ id: 'job-1', status: 'done' }],
    });

    const changed = await service.settle([waiting]);

    expect(changed.get('old')).toEqual({ replacedById: 'new' });
    expect(written.old).toEqual({ replacedById: 'new' });
  });

  it('пока выпуск идёт, документ остаётся действительным', async () => {
    // Самое важное правило: обещание нового документа не гасит настоящий.
    const { service, written } = serviceWith({
      fresh: [],
      jobs: [{ id: 'job-1', status: 'running' }],
    });

    const changed = await service.settle([waiting]);

    expect(changed.size).toBe(0);
    expect(written).toEqual({});
  });

  it('упавший выпуск снимает обещание, а не оставляет документ в подвешенном виде', async () => {
    const { service, written } = serviceWith({
      fresh: [],
      jobs: [{ id: 'job-1', status: 'failed' }],
    });

    const changed = await service.settle([waiting]);

    expect(changed.get('old')).toEqual({ replacedById: null });
    expect(written.old).toEqual({ replacedByJobId: null });
  });

  it('законченный выпуск без файла по этой строке тоже снимает обещание', async () => {
    // Строку могли удалить, пока пакет стоял в очереди, — документа нет.
    const { service, written } = serviceWith({
      fresh: [{ id: 'other', jobId: 'job-1', rowId: 'row-2' }],
      jobs: [{ id: 'job-1', status: 'done' }],
    });

    await service.settle([waiting]);

    expect(written.old).toEqual({ replacedByJobId: null });
  });

  it('уже связанные и никогда не перевыпускавшиеся не трогаются вовсе', async () => {
    const { service, written } = serviceWith({ fresh: [], jobs: [] });

    const changed = await service.settle([
      { id: 'a', orgId: ORG, rowId: 'r', replacedByJobId: 'job-1', replacedById: 'new' },
      { id: 'b', orgId: ORG, rowId: 'r', replacedByJobId: null, replacedById: null },
    ]);

    expect(changed.size).toBe(0);
    expect(written).toEqual({});
  });

  it('одиночная проверка возвращает найденную замену', async () => {
    const { service } = serviceWith({
      fresh: [{ id: 'new', jobId: 'job-1', rowId: 'row-1' }],
      jobs: [{ id: 'job-1', status: 'done' }],
    });

    await expect(service.settleOne(waiting)).resolves.toBe('new');
  });

  it('неудачная запись не роняет чтение', async () => {
    const prisma = {
      file: {
        findMany: async () => [{ id: 'new', jobId: 'job-1', rowId: 'row-1' }],
        update: async () => {
          throw new Error('база отказала');
        },
      },
      generationJob: { findMany: async () => [{ id: 'job-1', status: 'done' }] },
    };
    const service = new ReplacementService(prisma as never);

    await expect(service.settleOne(waiting)).resolves.toBe('new');
  });
});
