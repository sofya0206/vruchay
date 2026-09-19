import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { registryWhere } from '../registry/registry-filter';
import { SENT_STATUSES } from './scope';

/**
 * Сводка за период — экран «Аналитика» в реестре и плитки главной.
 *
 * Один запрос на экран: выпуск и проверки по дням, дельта к прошлому
 * такому же периоду, письма, состояние выданных и разбивка по материалам.
 * Всё — агрегаты по своей организации; строки в память не выбираются,
 * чтобы у организации с сотней тысяч документов экран открывался так же,
 * как у новой.
 *
 * «Выданное» — то же условие, что в реестре (`registryWhere`), поэтому
 * цифры здесь сходятся с тем, что человек видит в таблице. Проверки
 * берутся из `verify_daily` — обезличенного агрегата по дням
 * (см. verify/verify-counter.ts): кто проверял, там нет и быть не может.
 */

export const PERIODS = ['7d', '30d', '90d', '365d', 'all'] as const;
export type Period = (typeof PERIODS)[number];

const DAYS: Record<Period, number | null> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
  '365d': 365,
  all: null,
};
/** У «всего времени» график всё равно на год: дальше столбики не разглядеть. */
const CHART_DAYS_MAX = 365;
const MSK_OFFSET_MS = 3 * 3_600_000;
const DAY_MS = 86_400_000;
const TOP_MATERIALS = 50;

export interface DayPoint {
  /** «2026-09-20» по Москве */
  day: string;
  n: number;
}

export interface SummaryMaterial {
  documentId: string | null;
  title: string;
  eventName: string;
  issued: number;
  checks: number;
  checkedFiles: number;
  sent: number;
  delivered: number;
}

export interface Summary {
  period: Period;
  range: { from: string | null; to: string; prevFrom: string | null; prevTo: string | null };
  issued: { total: number; prev: number | null; byDay: DayPoint[] };
  checks: {
    total: number;
    prev: number | null;
    uniques: number;
    files: number;
    lastAt: string | null;
    byDay: DayPoint[];
  };
  mail: { sent: number; delivered: number; undelivered: number };
  states: { valid: number; revoked: number; replaced: number; expired: number };
  materials: SummaryMaterial[];
  materialsTotal: number;
}

/** Начало календарного дня по Москве, сдвинутого на `shiftDays` назад. */
export function mskDayStart(now: Date, shiftDays = 0): Date {
  const local = new Date(now.getTime() + MSK_OFFSET_MS);
  const dayUtc = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  return new Date(dayUtc - MSK_OFFSET_MS - shiftDays * DAY_MS);
}

function mskDayKey(d: Date): string {
  return new Date(d.getTime() + MSK_OFFSET_MS).toISOString().slice(0, 10);
}

/** Ряд из нулей на каждый день периода: график не должен пропускать пустые дни. */
function emptyDays(from: Date, days: number): Map<string, number> {
  const out = new Map<string, number>();
  for (let i = 0; i < days; i++) out.set(mskDayKey(new Date(from.getTime() + i * DAY_MS)), 0);
  return out;
}

@Injectable()
export class SummaryService {
  constructor(private readonly prisma: PrismaService) {}

  async forOrg(
    orgId: string,
    period: Period,
    documentId?: string,
    now = new Date(),
  ): Promise<Summary> {
    const days = DAYS[period];
    const chartDays = days ?? CHART_DAYS_MAX;
    const from = days ? mskDayStart(now, days - 1) : null;
    const chartFrom = mskDayStart(now, chartDays - 1);
    const prevFrom = from && days ? new Date(from.getTime() - days * DAY_MS) : null;

    const base = registryWhere(orgId, { documentId });
    const inRange: Prisma.FileWhereInput = from ? { ...base, createdAt: { gte: from } } : base;
    const inPrev: Prisma.FileWhereInput | null =
      prevFrom && from ? { ...base, createdAt: { gte: prevFrom, lt: from } } : null;
    const dayRange = from ? { gte: from } : undefined;
    const prevDayRange = prevFrom && from ? { gte: prevFrom, lt: from } : null;
    const dailyWhere: Prisma.VerifyDailyWhereInput = {
      orgId,
      ...(dayRange ? { day: dayRange } : {}),
      ...(documentId ? { file: { documentId } } : {}),
    };
    const docSql = documentId ? Prisma.sql`AND f.document_id = ${documentId}::uuid` : Prisma.empty;

    const [
      issuedTotal,
      issuedPrev,
      issuedRows,
      checksAgg,
      checksPrev,
      checksRows,
      checkedFiles,
      lastCheck,
      mailRows,
      revoked,
      replaced,
      expired,
      byDocument,
      checksByDocument,
      mailByDocument,
    ] = await Promise.all([
      this.prisma.file.count({ where: inRange }),
      inPrev ? this.prisma.file.count({ where: inPrev }) : Promise.resolve(null),
      // Выпуск по дням: границы дня по Москве, как и везде в сводках.
      this.prisma.$queryRaw<{ day: Date; n: bigint }[]>`
        SELECT (f.created_at + interval '3 hours')::date AS day, count(*)::bigint AS n
        FROM files f
        WHERE f.org_id = ${orgId}::uuid AND f.kind = 'generated' AND f.deleted_at IS NULL
          AND f.s3_key <> '' AND f.created_at >= ${chartFrom} ${docSql}
        GROUP BY 1`,
      this.prisma.verifyDaily.aggregate({
        where: dailyWhere,
        _sum: { checks: true, uniques: true },
      }),
      prevDayRange
        ? this.prisma.verifyDaily.aggregate({
            where: { ...dailyWhere, day: prevDayRange },
            _sum: { checks: true },
          })
        : Promise.resolve(null),
      this.prisma.verifyDaily.groupBy({
        by: ['day'],
        where: { ...dailyWhere, day: { gte: chartFrom } },
        _sum: { checks: true },
      }),
      this.prisma.file.count({
        where: { ...base, verifyDays: { some: dayRange ? { day: dayRange } : {} } },
      }),
      this.prisma.file.aggregate({ where: base, _max: { verifyLastAt: true } }),
      this.prisma.email.groupBy({
        by: ['status'],
        where: { orgId, file: inRange },
        _count: { _all: true },
      }),
      this.prisma.file.count({ where: { ...inRange, verifyRevoked: true } }),
      this.prisma.file.count({
        where: { ...inRange, verifyRevoked: false, replacedById: { not: null } },
      }),
      this.prisma.file.count({
        where: { ...inRange, verifyRevoked: false, replacedById: null, expiresAt: { lte: now } },
      }),
      this.prisma.file.groupBy({
        by: ['documentId'],
        where: inRange,
        _count: { _all: true },
        orderBy: { _count: { documentId: 'desc' } },
        take: TOP_MATERIALS,
      }),
      this.prisma.$queryRaw<{ document_id: string | null; checks: bigint; files: bigint }[]>`
        SELECT f.document_id, sum(v.checks)::bigint AS checks, count(DISTINCT v.file_id)::bigint AS files
        FROM verify_daily v JOIN files f ON f.id = v.file_id
        WHERE v.org_id = ${orgId}::uuid ${from ? Prisma.sql`AND v.day >= ${from}::date` : Prisma.empty} ${docSql}
        GROUP BY 1`,
      this.prisma.email.groupBy({
        by: ['documentId', 'status'],
        where: { orgId, file: inRange },
        _count: { _all: true },
      }),
    ]);

    const issuedByDay = emptyDays(chartFrom, chartDays);
    for (const r of issuedRows) {
      const key = r.day.toISOString().slice(0, 10);
      if (issuedByDay.has(key)) issuedByDay.set(key, Number(r.n));
    }
    const checksByDay = emptyDays(chartFrom, chartDays);
    for (const r of checksRows) {
      const key = r.day.toISOString().slice(0, 10);
      if (checksByDay.has(key)) checksByDay.set(key, r._sum.checks ?? 0);
    }

    const mailCount = new Map(mailRows.map((m) => [m.status, m._count._all]));
    const mail = (...statuses: string[]) =>
      statuses.reduce((s, st) => s + (mailCount.get(st as never) ?? 0), 0);

    const documentIds = byDocument
      .map((d) => d.documentId)
      .filter((id): id is string => id !== null);
    const documents = documentIds.length
      ? await this.prisma.document.findMany({
          where: { id: { in: documentIds }, orgId },
          select: { id: true, title: true, eventName: true },
        })
      : [];
    const titles = new Map(documents.map((d) => [d.id, d]));
    const checksOf = new Map(checksByDocument.map((c) => [c.document_id, c]));
    const mailOf = new Map<string | null, { sent: number; delivered: number }>();
    for (const m of mailByDocument) {
      const row = mailOf.get(m.documentId) ?? { sent: 0, delivered: 0 };
      if ((SENT_STATUSES as readonly string[]).includes(m.status)) row.sent += m._count._all;
      if (m.status === 'delivered' || m.status === 'opened') row.delivered += m._count._all;
      mailOf.set(m.documentId, row);
    }

    const materialsTotal = await this.prisma.file
      .groupBy({ by: ['documentId'], where: inRange })
      .then((rows) => rows.length);

    const total = issuedTotal;
    return {
      period,
      range: {
        from: from?.toISOString() ?? null,
        to: now.toISOString(),
        prevFrom: prevFrom?.toISOString() ?? null,
        prevTo: prevFrom ? from!.toISOString() : null,
      },
      issued: {
        total,
        prev: issuedPrev,
        byDay: [...issuedByDay].map(([day, n]) => ({ day, n })),
      },
      checks: {
        total: checksAgg._sum.checks ?? 0,
        prev: checksPrev ? (checksPrev._sum.checks ?? 0) : null,
        uniques: checksAgg._sum.uniques ?? 0,
        files: checkedFiles,
        lastAt: lastCheck._max.verifyLastAt?.toISOString() ?? null,
        byDay: [...checksByDay].map(([day, n]) => ({ day, n })),
      },
      // Письма нарастающим итогом, как в сводке реестра: доставленное
      // когда-то было отправленным, а не доставленное ушло и вернулось.
      mail: {
        sent: mail(...SENT_STATUSES),
        delivered: mail('delivered', 'opened'),
        undelivered: mail('bounced', 'failed'),
      },
      states: { valid: total - revoked - replaced - expired, revoked, replaced, expired },
      materials: byDocument.map((d) => {
        const doc = d.documentId ? titles.get(d.documentId) : undefined;
        const c = checksOf.get(d.documentId);
        const m = mailOf.get(d.documentId) ?? { sent: 0, delivered: 0 };
        return {
          documentId: d.documentId,
          title: d.documentId ? (doc?.title ?? 'Материал удалён') : 'Без материала',
          eventName: doc?.eventName ?? '',
          issued: d._count._all,
          checks: c ? Number(c.checks) : 0,
          checkedFiles: c ? Number(c.files) : 0,
          sent: m.sent,
          delivered: m.delivered,
        };
      }),
      materialsTotal,
    };
  }
}
