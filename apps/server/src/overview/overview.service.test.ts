import { describe, expect, it, vi } from 'vitest';
import { OverviewService, monthStart } from './overview.service';

/*
 * Сводка рабочего стола.
 *
 * Проверяем не вёрстку, а две вещи, в которых ошибка не видна на глаз:
 * границу месяца (она считается по Москве, а сервер живёт в UTC) и то,
 * что каждая выборка ограничена своей организацией.
 */

interface Call {
  where?: Record<string, unknown>;
  take?: number;
  orderBy?: unknown;
}

function serviceWith({
  issuedTotal = 0,
  issuedMonth = 0,
  emailsSent = 0,
  materials = 0,
  documents = [] as unknown[],
  jobs = [] as unknown[],
}) {
  const calls: Record<string, Call[]> = {
    file: [],
    email: [],
    documentCount: [],
    documentList: [],
    jobs: [],
  };

  const prisma = {
    file: {
      // Первый счёт — за всё время, второй — за месяц: их различает
      // условие по дате, и путать их нельзя.
      count: vi.fn(async (args: Call) => {
        calls.file.push(args);
        return args.where?.createdAt === undefined ? issuedTotal : issuedMonth;
      }),
    },
    email: {
      count: vi.fn(async (args: Call) => {
        calls.email.push(args);
        return emailsSent;
      }),
    },
    document: {
      count: vi.fn(async (args: Call) => {
        calls.documentCount.push(args);
        return materials;
      }),
      findMany: vi.fn(async (args: Call) => {
        calls.documentList.push(args);
        return documents;
      }),
    },
    generationJob: {
      findMany: vi.fn(async (args: Call) => {
        calls.jobs.push(args);
        return jobs;
      }),
    },
  };

  const org = {
    usage: vi.fn(async () => ({ plan: 'free' as const, used: 12, limit: 50, left: 38, bonus: 0 })),
  };

  return { service: new OverviewService(prisma as never, org as never), calls, org };
}

describe('граница месяца', () => {
  it('считается по московскому времени, а не по времени сервера', () => {
    // Первое сентября, 00:30 по Москве — это ещё 31 августа 21:30 по UTC.
    // Месяц уже сентябрьский, поэтому отсчёт начинается с этой же ночи.
    const start = monthStart(new Date('2026-08-31T21:30:00Z'));
    expect(start.toISOString()).toBe('2026-08-31T21:00:00.000Z');
  });

  it('последние часы августа по Москве остаются в августе', () => {
    // 31 августа 23:00 по Москве — это 31 августа 20:00 по UTC.
    const start = monthStart(new Date('2026-08-31T20:00:00Z'));
    expect(start.toISOString()).toBe('2026-07-31T21:00:00.000Z');
  });
});

describe('сводка', () => {
  it('все выборки ограничены своей организацией', async () => {
    const { service, calls } = serviceWith({});
    await service.summary('org-1', new Date('2026-08-28T10:00:00Z'));

    const orgIds = [
      ...calls.file,
      ...calls.email,
      ...calls.documentCount,
      ...calls.documentList,
      ...calls.jobs,
    ].map((c) => c.where?.orgId);

    expect(orgIds).toHaveLength(6);
    expect(orgIds.every((id) => id === 'org-1')).toBe(true);
  });

  it('за месяц считает только выпущенные файлы и только с первого числа', async () => {
    const { service, calls } = serviceWith({ issuedMonth: 7 });
    const summary = await service.summary('org-1', new Date('2026-08-28T10:00:00Z'));

    expect(summary.issuedMonth).toBe(7);
    expect(calls.file[1].where).toMatchObject({
      kind: 'generated',
      createdAt: { gte: new Date('2026-07-31T21:00:00.000Z') },
    });
  });

  it('в отправленные письма не попадают ни очередь, ни отказы', async () => {
    const { service, calls } = serviceWith({ emailsSent: 40 });
    const summary = await service.summary('org-1');

    expect(summary.emailsSent).toBe(40);
    expect(calls.email[0].where?.status).toEqual({ in: ['sent', 'delivered', 'opened'] });
  });

  it('выпущено за всё время считается отдельно от остатка по плану', async () => {
    // По плану израсходованным считается выпущенное с начала плана,
    // а «за всё время» на рабочем столе означает ровно то, что написано:
    // прошлогодние документы из этой цифры пропасть не должны.
    const { service, calls } = serviceWith({ issuedTotal: 900, issuedMonth: 7 });
    const summary = await service.summary('org-1');

    expect(summary.issuedTotal).toBe(900);
    expect(calls.file[0].where?.createdAt).toBeUndefined();
    expect(summary.usage).toMatchObject({ left: 38, limit: 50 });
  });

  it('списки короткие и свежие сверху — строки в память не выбираются', async () => {
    const { service, calls } = serviceWith({});
    await service.summary('org-1');

    expect(calls.documentList[0]).toMatchObject({
      take: 5,
      orderBy: { updatedAt: 'desc' },
    });
    expect(calls.jobs[0]).toMatchObject({ take: 5, orderBy: { createdAt: 'desc' } });
  });

  it('удалённые материалы не считаются и в списке не показываются', async () => {
    const { service, calls } = serviceWith({ materials: 3 });
    const summary = await service.summary('org-1');

    expect(summary.materials).toBe(3);
    expect(calls.documentCount[0].where).toMatchObject({ deletedAt: null });
    expect(calls.documentList[0].where).toMatchObject({ deletedAt: null });
  });

  it('у задания на выпуск рядом стоит название материала', async () => {
    const { service } = serviceWith({
      jobs: [
        {
          id: 'job-1',
          documentId: 'doc-1',
          status: 'done',
          total: 30,
          done: 30,
          failed: 0,
          createdAt: new Date('2026-08-27T09:00:00Z'),
          document: { title: 'Грамота за первое место' },
        },
      ],
    });

    const summary = await service.summary('org-1');
    expect(summary.jobs[0]).toMatchObject({
      id: 'job-1',
      documentId: 'doc-1',
      documentTitle: 'Грамота за первое место',
      status: 'done',
    });
  });

  it('новая организация: нули и пустые списки, а не ошибка', async () => {
    const { service } = serviceWith({});
    const summary = await service.summary('org-new');

    expect(summary.materials).toBe(0);
    expect(summary.documents).toEqual([]);
    expect(summary.jobs).toEqual([]);
  });
});
