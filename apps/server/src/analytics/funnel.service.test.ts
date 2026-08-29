import { describe, expect, it, vi } from 'vitest';
import { FunnelService } from './funnel.service';

/*
 * Воронка активации по всем организациям.
 *
 * Главное, что здесь проверяется, — два свойства, за которые отвечать:
 * воронка не растёт снизу вверх, и в ответе нет ничего, по чему можно
 * узнать конкретную организацию или человека.
 */

interface Org {
  id: string;
  createdAt: Date;
}

interface Group {
  orgId: string;
  documentId: string;
  createdAt: Date;
  count?: number;
  verifyCount?: number;
}

function serviceWith({
  orgs = [] as Org[],
  withRows = [] as string[],
  withCheck = [] as string[],
  withJobs = [] as string[],
  issued = [] as Group[],
  mailed = [] as string[],
  jobs = [] as { status: string; count: number }[],
  cleanJobs = 0,
  reissued = 0,
}) {
  const prisma = {
    organization: { findMany: vi.fn(async () => orgs) },
    document: {
      findMany: vi.fn(async () => withRows.map((orgId) => ({ orgId }))),
    },
    auditEvent: {
      groupBy: vi.fn(async () => withCheck.map((orgId) => ({ orgId, _count: { _all: 1 } }))),
    },
    generationJob: {
      groupBy: vi.fn(async (args: { by: string[] }) =>
        args.by[0] === 'orgId'
          ? withJobs.map((orgId) => ({ orgId, _count: { _all: 1 } }))
          : jobs.map((j) => ({ status: j.status, _count: { _all: j.count } })),
      ),
      count: vi.fn(async () => cleanJobs),
    },
    file: {
      groupBy: vi.fn(async () =>
        issued.map((g) => ({
          orgId: g.orgId,
          documentId: g.documentId,
          _min: { createdAt: g.createdAt },
          _count: { _all: g.count ?? 1 },
          _sum: { verifyCount: g.verifyCount ?? 0 },
        })),
      ),
      count: vi.fn(async () => reissued),
    },
    email: {
      groupBy: vi.fn(async () => mailed.map((orgId) => ({ orgId, _count: { _all: 1 } }))),
    },
  };

  return { service: new FunnelService(prisma as never), prisma };
}

const NOW = new Date('2026-08-29T12:00:00Z');
const REGISTERED = new Date('2026-08-01T09:00:00Z');

describe('воронка', () => {
  it('шаги идут по убыванию', async () => {
    const { service } = serviceWith({
      orgs: [
        { id: 'a', createdAt: REGISTERED },
        { id: 'b', createdAt: REGISTERED },
        { id: 'c', createdAt: REGISTERED },
      ],
      withRows: ['a', 'b'],
      withJobs: ['a'],
      issued: [{ orgId: 'a', documentId: 'd1', createdAt: new Date('2026-08-01T09:06:00Z') }],
      mailed: ['a'],
    });

    const funnel = await service.platform(NOW);
    const counts = funnel.steps.map((s) => s.organizations);

    expect(funnel.organizations).toBe(3);
    expect(counts).toEqual([...counts].sort((x, y) => y - x));
    expect(counts[0]).toBe(3);
  });

  it('организация с выпуском засчитана на всех шагах до выпуска', async () => {
    // Список получателей удалён вместе с материалом, а грамоты выданы:
    // без правила монотонности вышло бы «выпустили 1, загрузили 0».
    const { service } = serviceWith({
      orgs: [{ id: 'a', createdAt: REGISTERED }],
      issued: [{ orgId: 'a', documentId: 'd1', createdAt: new Date('2026-08-01T09:30:00Z') }],
    });

    const funnel = await service.platform(NOW);
    const byKey = Object.fromEntries(funnel.steps.map((s) => [s.key, s.organizations]));

    expect(byKey.imported).toBe(1);
    expect(byKey.checked).toBe(1);
    expect(byKey.issued).toBe(1);
    expect(byKey.mailed).toBe(0);
  });

  it('вернувшейся считается та, что выпускала в разные дни', async () => {
    const { service } = serviceWith({
      orgs: [
        { id: 'a', createdAt: REGISTERED },
        { id: 'b', createdAt: REGISTERED },
      ],
      issued: [
        // Одно награждение двумя материалами — не возвращение.
        { orgId: 'a', documentId: 'd1', createdAt: new Date('2026-08-01T10:00:00Z') },
        { orgId: 'a', documentId: 'd2', createdAt: new Date('2026-08-01T18:00:00Z') },
        // Второе мероприятие через неделю — возвращение.
        { orgId: 'b', documentId: 'd3', createdAt: new Date('2026-08-01T10:00:00Z') },
        { orgId: 'b', documentId: 'd4', createdAt: new Date('2026-08-08T10:00:00Z') },
      ],
      mailed: ['a', 'b'],
    });

    const funnel = await service.platform(NOW);
    expect(funnel.steps.at(-1)).toMatchObject({ key: 'returned', organizations: 1 });
  });
});

describe('время до первого документа', () => {
  it('медиана и попадание в десять минут считаются только по выпускавшим', async () => {
    const { service } = serviceWith({
      orgs: [
        { id: 'a', createdAt: REGISTERED },
        { id: 'b', createdAt: REGISTERED },
        { id: 'c', createdAt: REGISTERED },
        // Эта не выпускала — в расчёт времени не входит вовсе.
        { id: 'd', createdAt: REGISTERED },
      ],
      issued: [
        { orgId: 'a', documentId: 'd1', createdAt: new Date('2026-08-01T09:06:00Z') },
        { orgId: 'b', documentId: 'd2', createdAt: new Date('2026-08-01T09:09:00Z') },
        { orgId: 'c', documentId: 'd3', createdAt: new Date('2026-08-03T09:00:00Z') },
      ],
    });

    const funnel = await service.platform(NOW);
    expect(funnel.timeToFirst.organizations).toBe(3);
    expect(funnel.timeToFirst.medianMinutes).toBe(9);
    expect(funnel.timeToFirst.inTarget).toBe(2);
    expect(funnel.timeToFirst.inTargetShare).toBeCloseTo(2 / 3);
  });

  it('пока никто не выпускал, медианы нет — а не ноль минут', async () => {
    const { service } = serviceWith({ orgs: [{ id: 'a', createdAt: REGISTERED }] });
    const funnel = await service.platform(NOW);

    expect(funnel.timeToFirst.medianMinutes).toBeNull();
    expect(funnel.timeToFirst.inTargetShare).toBeNull();
  });
});

describe('качество выпуска', () => {
  it('доля пакетов без ошибок и доля перевыпусков считаются по всем сразу', async () => {
    const { service } = serviceWith({
      orgs: [{ id: 'a', createdAt: REGISTERED }],
      issued: [
        { orgId: 'a', documentId: 'd1', createdAt: REGISTERED, count: 80, verifyCount: 12 },
        { orgId: 'a', documentId: 'd2', createdAt: REGISTERED, count: 20, verifyCount: 3 },
      ],
      jobs: [
        { status: 'done', count: 9 },
        { status: 'failed', count: 1 },
        { status: 'canceled', count: 4 },
      ],
      cleanJobs: 8,
      reissued: 5,
    });

    const funnel = await service.platform(NOW);
    expect(funnel.packages).toEqual({ finished: 10, clean: 8, cleanShare: 0.8 });
    expect(funnel.reissues).toEqual({ issued: 100, count: 5, share: 0.05 });
    expect(funnel.verifications.total).toBe(15);
  });
});

describe('обезличенность', () => {
  it('в ответе нет ни идентификаторов организаций, ни названий', async () => {
    const { service } = serviceWith({
      orgs: [{ id: 'org-secret', createdAt: REGISTERED }],
      withRows: ['org-secret'],
      issued: [{ orgId: 'org-secret', documentId: 'doc-secret', createdAt: REGISTERED }],
      mailed: ['org-secret'],
    });

    const funnel = await service.platform(NOW);
    const json = JSON.stringify(funnel);

    expect(json).not.toContain('org-secret');
    expect(json).not.toContain('doc-secret');
  });

  it('шаг проверки помечен как приблизительный', async () => {
    const { service } = serviceWith({ orgs: [] });
    const funnel = await service.platform(NOW);

    expect(funnel.notes.checked).toMatch(/отдельной отметки/);
  });
});
