import { describe, expect, it, vi } from 'vitest';
import { MetricsService } from './metrics.service';

/*
 * Цифры по организации.
 *
 * Проверяем не разметку, а то, что ошибётся молча: что каждая выборка
 * ограничена своей организацией, что «выданное» здесь означает ровно
 * то же, что в реестре, что время до первого документа считается
 * от регистрации и что у новой организации доли пустые, а не нулевые.
 */

interface Where {
  where?: Record<string, unknown>;
}

interface Counts {
  issued?: number;
  verifications?: number;
  verifiedFiles?: number;
  reissued?: number;
  monthIssued?: number;
  monthVerified?: number;
  mailed?: number;
  cleanJobs?: number;
  materialsWithRows?: number;
  checkTraces?: number;
  firstIssues?: (Date | null)[];
  jobs?: { status: string; count: number }[];
}

function serviceWith(counts: Counts) {
  const seen: Record<string, Record<string, unknown>[]> = {
    file: [],
    email: [],
    job: [],
    document: [],
    audit: [],
    org: [],
  };

  const prisma = {
    organization: {
      findUnique: vi.fn(async (args: { where: Record<string, unknown> }) => {
        seen.org.push(args.where);
        return { createdAt: new Date('2026-08-29T10:00:00Z') };
      }),
    },
    file: {
      aggregate: vi.fn(async (args: Where) => {
        seen.file.push(args.where ?? {});
        return {
          _count: { _all: counts.issued ?? 0 },
          _sum: { verifyCount: counts.verifications ?? 0 },
        };
      }),
      count: vi.fn(async (args: Where) => {
        const where = args.where ?? {};
        seen.file.push(where);
        if ('verifyCount' in where) return counts.verifiedFiles ?? 0;
        if ('OR' in where) return counts.reissued ?? 0;
        if ('verifyLastAt' in where) return counts.monthVerified ?? 0;
        if ('createdAt' in where) return counts.monthIssued ?? 0;
        return 0;
      }),
      groupBy: vi.fn(async (args: Where) => {
        seen.file.push(args.where ?? {});
        return (counts.firstIssues ?? []).map((createdAt, i) => ({
          documentId: `doc-${i}`,
          _min: { createdAt },
        }));
      }),
    },
    email: {
      count: vi.fn(async (args: Where) => {
        const where = args.where ?? {};
        seen.email.push(where);
        return 'sentAt' in where ? 0 : (counts.mailed ?? 0);
      }),
    },
    generationJob: {
      groupBy: vi.fn(async (args: Where) => {
        seen.job.push(args.where ?? {});
        return (counts.jobs ?? []).map((j) => ({ status: j.status, _count: { _all: j.count } }));
      }),
      count: vi.fn(async (args: Where) => {
        seen.job.push(args.where ?? {});
        return counts.cleanJobs ?? 0;
      }),
    },
    document: {
      count: vi.fn(async (args: Where) => {
        seen.document.push(args.where ?? {});
        return counts.materialsWithRows ?? 0;
      }),
    },
    auditEvent: {
      count: vi.fn(async (args: Where) => {
        seen.audit.push(args.where ?? {});
        return counts.checkTraces ?? 0;
      }),
    },
  };

  return { service: new MetricsService(prisma as never), seen };
}

const NOW = new Date('2026-08-29T12:00:00Z');

describe('доступ к чужому', () => {
  it('каждая выборка ограничена своей организацией', async () => {
    const { service, seen } = serviceWith({});
    await service.forOrg('org-1', NOW);

    const all = [...seen.file, ...seen.email, ...seen.job, ...seen.document, ...seen.audit];
    expect(all.length).toBeGreaterThan(8);
    expect(all.every((w) => w.orgId === 'org-1')).toBe(true);
    expect(seen.org[0]).toEqual({ id: 'org-1' });
  });

  it('«выданное» означает то же, что в реестре', async () => {
    const { service, seen } = serviceWith({});
    await service.forOrg('org-1', NOW);

    // Условие берётся у реестра целиком: удалённые и пустые записи
    // не в счёт, иначе цифры разошлись бы с таблицей.
    expect(seen.file[0]).toMatchObject({
      orgId: 'org-1',
      kind: 'generated',
      deletedAt: null,
      s3Key: { not: '' },
    });
  });
});

describe('время до первого документа', () => {
  it('считается от регистрации до самого раннего выпуска', async () => {
    const { service } = serviceWith({
      issued: 30,
      firstIssues: [new Date('2026-08-29T10:07:00Z'), new Date('2026-08-30T09:00:00Z')],
    });

    const summary = await service.forOrg('org-1', NOW);
    expect(summary.timeToFirst.minutes).toBe(7);
    expect(summary.timeToFirst.targetMinutes).toBe(10);
    expect(summary.timeToFirst.firstIssuedAt?.toISOString()).toBe('2026-08-29T10:07:00.000Z');
  });

  it('у не выпускавшей организации времени нет — и это не ноль', async () => {
    const { service } = serviceWith({});
    const summary = await service.forOrg('org-1', NOW);

    expect(summary.timeToFirst.minutes).toBeNull();
    expect(summary.timeToFirst.firstIssuedAt).toBeNull();
  });
});

describe('пакеты и перевыпуски', () => {
  it('доля без ошибок считается от законченных, отменённые в знаменатель не идут', async () => {
    const { service } = serviceWith({
      jobs: [
        { status: 'done', count: 8 },
        { status: 'failed', count: 2 },
        { status: 'canceled', count: 5 },
        { status: 'running', count: 1 },
      ],
      cleanJobs: 7,
    });

    const summary = await service.forOrg('org-1', NOW);
    expect(summary.packages.finished).toBe(10);
    expect(summary.packages.clean).toBe(7);
    expect(summary.packages.cleanShare).toBe(0.7);
    expect(summary.packages.started).toBe(16);
  });

  it('в перевыпуски попадают и обещанные, и состоявшиеся замены', async () => {
    const { service, seen } = serviceWith({ issued: 200, reissued: 6 });
    const summary = await service.forOrg('org-1', NOW);

    expect(summary.reissues.count).toBe(6);
    expect(summary.reissues.share).toBe(0.03);

    const withOr = seen.file.find((w) => 'OR' in w);
    expect(withOr?.OR).toEqual([
      { replacedById: { not: null } },
      { replacedByJobId: { not: null } },
    ]);
  });

  it('у новой организации доли пустые, а не нулевые', async () => {
    const { service } = serviceWith({});
    const summary = await service.forOrg('org-1', NOW);

    expect(summary.packages.cleanShare).toBeNull();
    expect(summary.reissues.share).toBeNull();
  });
});

describe('проверки по QR', () => {
  it('отдаёт число проверок и число проверенных документов', async () => {
    const { service } = serviceWith({
      issued: 340,
      verifications: 512,
      verifiedFiles: 96,
      monthVerified: 12,
    });

    const summary = await service.forOrg('org-1', NOW);
    expect(summary.verifications).toEqual({ total: 512, files: 96 });
    expect(summary.thisMonth.verifiedFiles).toBe(12);
  });

  it('ни в одной цифре нет сведений о том, кто проверял', async () => {
    const { service } = serviceWith({ issued: 10, verifications: 3 });
    const summary = await service.forOrg('org-1', NOW);

    // Ответ — только счётчики: ни адресов, ни устройств, ни отметок
    // о конкретных проверках здесь не появляется.
    expect(Object.keys(summary.verifications).sort()).toEqual(['files', 'total']);
  });
});

describe('воронка организации', () => {
  it('выпустившая организация числится и загрузившей список', async () => {
    const { service } = serviceWith({
      issued: 5,
      materialsWithRows: 0,
      firstIssues: [new Date('2026-08-29T10:30:00Z')],
    });

    const summary = await service.forOrg('org-1', NOW);
    const steps = Object.fromEntries(summary.activation.steps.map((s) => [s.key, s.done]));

    expect(steps.imported).toBe(true);
    expect(steps.issued).toBe(true);
    expect(steps.mailed).toBe(false);
  });

  it('второй материал в тот же день возвращением не считается', async () => {
    const sameDay = serviceWith({
      issued: 5,
      mailed: 5,
      firstIssues: [new Date('2026-08-29T10:00:00Z'), new Date('2026-08-29T18:00:00Z')],
    });
    const first = await sameDay.service.forOrg('org-1', NOW);
    expect(first.activation.steps.at(-1)?.done).toBe(false);

    const twoDays = serviceWith({
      issued: 5,
      mailed: 5,
      firstIssues: [new Date('2026-08-29T10:00:00Z'), new Date('2026-09-05T10:00:00Z')],
    });
    const second = await twoDays.service.forOrg('org-1', NOW);
    expect(second.activation.steps.at(-1)?.done).toBe(true);
  });
});

describe('месяц', () => {
  it('текущий и прошлый месяц берутся по московским границам', async () => {
    const { service, seen } = serviceWith({ monthIssued: 40 });
    const summary = await service.forOrg('org-1', NOW);

    expect(summary.thisMonth.issued).toBe(40);
    const ranges = seen.file
      .map((w) => w.createdAt as { gte: Date; lt: Date } | undefined)
      .filter((r): r is { gte: Date; lt: Date } => Boolean(r));

    expect(ranges).toContainEqual({
      gte: new Date('2026-07-31T21:00:00.000Z'),
      lt: new Date('2026-08-31T21:00:00.000Z'),
    });
    expect(ranges).toContainEqual({
      gte: new Date('2026-06-30T21:00:00.000Z'),
      lt: new Date('2026-07-31T21:00:00.000Z'),
    });
  });
});
