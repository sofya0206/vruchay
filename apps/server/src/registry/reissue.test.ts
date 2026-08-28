import { describe, expect, it } from 'vitest';
import { RegistryActionsService } from './registry-actions.service';

/** Файл в реестре, каким его видит перевыпуск. */
interface FileFixture {
  id: string;
  orgId: string;
  mime: string;
  documentId: string | null;
  rowId: string | null;
  replacedById: string | null;
  replacedByJobId: string | null;
  row: { data: Record<string, string> } | null;
  document: { deletedAt: Date | null } | null;
}

interface World {
  files: FileFixture[];
  plan?: 'free' | 'paid';
  issued?: number;
  runningJob?: boolean;
}

/** Что ушло в очередь — по этому и судим, что перевыпуск состоялся. */
interface Recorded {
  enqueued: { jobId: string; rowIds: string[] }[];
  checkedRows: string[];
  promised: { fileIds: string[]; jobId: string }[];
}

function serviceWith(world: World): { service: RegistryActionsService; recorded: Recorded } {
  const recorded: Recorded = { enqueued: [], checkedRows: [], promised: [] };
  let jobs = 0;

  const tx = {
    organization: { findUnique: async () => ({ id: 'org', plan: world.plan ?? 'paid' }) },
    generationJob: {
      findFirst: async () => (world.runningJob ? { id: 'busy' } : null),
      findMany: async () => [],
      create: async ({ data }: { data: { documentId: string; total: number } }) => ({
        id: `job-${++jobs}`,
        total: data.total,
        attempt: 1,
        documentId: data.documentId,
      }),
    },
    file: {
      count: async () => world.issued ?? 0,
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: { in: string[] } };
        data: { replacedByJobId: string };
      }) => {
        recorded.promised.push({ fileIds: where.id.in, jobId: data.replacedByJobId });
        return { count: where.id.in.length };
      },
    },
    recipientRow: {
      updateMany: async ({ where }: { where: { id: { in: string[] } } }) => {
        recorded.checkedRows.push(...where.id.in);
        return { count: where.id.in.length };
      },
    },
    // Замок на организацию берётся через $executeRaw: pg_advisory_xact_lock
    // возвращает void, и $queryRaw на нём падает.
    $executeRaw: async () => 0,
  };

  const prisma = {
    file: { findMany: async () => world.files },
    $transaction: async (work: (t: typeof tx) => Promise<unknown>) => work(tx),
  };
  const replacement = { settle: async () => new Map() };
  const referral = { bonusDocuments: async () => 0 };
  const generation = {
    enqueue: async (job: { id: string }, rowIds: string[]) => {
      recorded.enqueued.push({ jobId: job.id, rowIds });
      return 1;
    },
  };

  const service = new RegistryActionsService(
    prisma as never,
    replacement as never,
    referral as never,
    generation as never,
    {} as never,
    {} as never,
  );
  return { service, recorded };
}

function file(over: Partial<FileFixture> = {}): FileFixture {
  return {
    id: 'file-1',
    orgId: 'org',
    mime: 'application/pdf',
    documentId: 'doc-1',
    rowId: 'row-1',
    replacedById: null,
    replacedByJobId: null,
    row: { data: { name: 'Иванова Анна' } },
    document: { deletedAt: null },
    ...over,
  };
}

describe('перевыпуск из реестра', () => {
  it('ставит задание в общую очередь и обещает замену старому файлу', async () => {
    const { service, recorded } = serviceWith({ files: [file()] });

    const result = await service.reissue('org', ['file-1']);

    expect(result.reissued).toBe(1);
    expect(result.skipped).toEqual([]);
    expect(recorded.enqueued).toEqual([{ jobId: 'job-1', rowIds: ['row-1'] }]);
    expect(recorded.promised).toEqual([{ fileIds: ['file-1'], jobId: 'job-1' }]);
  });

  it('возвращает отметку строке: воркер печатает только отмеченные', async () => {
    const { service, recorded } = serviceWith({ files: [file()] });

    await service.reissue('org', ['file-1']);

    expect(recorded.checkedRows).toEqual(['row-1']);
  });

  it('одно задание на материал, даже если отмечено несколько строк', async () => {
    const { service, recorded } = serviceWith({
      files: [file(), file({ id: 'file-2', rowId: 'row-2' })],
    });

    const result = await service.reissue('org', ['file-1', 'file-2']);

    expect(result.jobs).toHaveLength(1);
    expect(recorded.enqueued[0].rowIds).toEqual(['row-1', 'row-2']);
    expect(result.reissued).toBe(2);
  });

  it('разные материалы — разные задания', async () => {
    const { service } = serviceWith({
      files: [file(), file({ id: 'file-2', documentId: 'doc-2', rowId: 'row-2' })],
    });

    const result = await service.reissue('org', ['file-1', 'file-2']);

    expect(result.jobs.map((j) => j.documentId)).toEqual(['doc-1', 'doc-2']);
  });

  it('без строки в таблице перевыпускать нечего — и объясняет почему', async () => {
    const { service, recorded } = serviceWith({ files: [file({ rowId: null })] });

    const result = await service.reissue('org', ['file-1']);

    expect(result.reissued).toBe(0);
    expect(result.skipped[0]).toMatchObject({
      name: 'Иванова Анна',
      reason: 'строки больше нет в таблице получателей',
    });
    expect(recorded.enqueued).toEqual([]);
  });

  it('уже заменённый не перевыпускается второй раз', async () => {
    const { service } = serviceWith({ files: [file({ replacedById: 'file-new' })] });

    const result = await service.reissue('org', ['file-1']);

    expect(result.reissued).toBe(0);
    expect(result.skipped[0].reason).toContain('уже заменён');
  });

  it('заказанный перевыпуск не заказывается повторно', async () => {
    const { service } = serviceWith({ files: [file({ replacedByJobId: 'job-0' })] });

    const result = await service.reissue('org', ['file-1']);

    expect(result.skipped[0].reason).toContain('уже заказан');
  });

  it('материал в корзине перевыпуску не подлежит', async () => {
    const { service } = serviceWith({ files: [file({ document: { deletedAt: new Date() } })] });

    const result = await service.reissue('org', ['file-1']);

    expect(result.skipped[0].reason).toContain('в корзине');
  });

  it('идущий выпуск по материалу откладывает перевыпуск, а не роняет запрос', async () => {
    const { service } = serviceWith({ files: [file()], runningJob: true });

    const result = await service.reissue('org', ['file-1']);

    expect(result.reissued).toBe(0);
    expect(result.skipped[0].reason).toContain('уже идёт выпуск');
  });

  it('перевыпуск считается наравне с выпуском и упирается в бесплатную пробу', async () => {
    process.env.FREE_DOCUMENT_LIMIT = '50';
    const { service } = serviceWith({ files: [file()], plan: 'free', issued: 50 });

    const result = await service.reissue('org', ['file-1']);

    expect(result.reissued).toBe(0);
    expect(result.skipped[0].reason).toContain('бесплатной пробе');
    delete process.env.FREE_DOCUMENT_LIMIT;
  });

  it('на оплаченном тарифе проба не мешает', async () => {
    const { service } = serviceWith({ files: [file()], plan: 'paid', issued: 100_000 });

    const result = await service.reissue('org', ['file-1']);

    expect(result.reissued).toBe(1);
  });
});
