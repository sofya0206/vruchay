import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { EmailStatus } from '../mail/email-status';
import {
  addToFunnel,
  emptyFunnel,
  fillDays,
  type DayRow,
  type Funnel,
  type Period,
} from './mail-stats';

/** Строка разбивки: материал или рассылка без документа. */
export interface SourceRow extends Funnel {
  id: string;
  type: 'document' | 'mailing';
  title: string;
  /** Мероприятие материала — по нему разбивку собирают второй раз. */
  eventName: string;
}

/** Сколько строк разбивки отдавать: остальное — хвост из единичных писем. */
const SOURCES_LIMIT = 100;

/**
 * Сводка по письмам организации за отрезок.
 *
 * Считаем по дню постановки в очередь, а не по дню события: строка
 * «15 сентября» отвечает на вопрос «что стало с письмами, отправленными
 * в этот день». Открытие через неделю попадёт в тот же день, а не
 * размажется по ряду отдельной точкой без знаменателя.
 *
 * Ничего личного: только счётчики. Адресов в сводке нет — за ними
 * в журнал писем, где они и так видны тому, кто рассылал.
 */
@Injectable()
export class MailStatsService {
  constructor(private readonly prisma: PrismaService) {}

  async stats(orgId: string, period: Period) {
    const [days, sources] = await Promise.all([
      this.byDay(orgId, period),
      this.bySource(orgId, period),
    ]);

    const totals = emptyFunnel();
    for (const day of days) {
      for (const key of Object.keys(totals) as (keyof Funnel)[]) totals[key] += day[key];
    }

    return { from: period.from, to: period.to, totals, days, sources };
  }

  /**
   * Ряд по дням.
   *
   * Сырым запросом, потому что группировать надо по московскому дню,
   * а Prisma группирует только по столбцам. queued_at хранится без пояса
   * в UTC — отсюда двойное AT TIME ZONE. Границы передаются строками
   * с явным приведением: так результат не зависит от пояса сессии базы.
   */
  private async byDay(orgId: string, period: Period): Promise<DayRow[]> {
    const rows = await this.prisma.$queryRaw<{ day: string; status: EmailStatus; n: number }[]>`
      SELECT to_char(("queued_at" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Moscow', 'YYYY-MM-DD') AS day,
             "status"::text AS status,
             count(*)::int AS n
      FROM "emails"
      WHERE "org_id" = ${orgId}::uuid
        AND "queued_at" >= (${period.start.toISOString()}::timestamptz AT TIME ZONE 'UTC')
        AND "queued_at" < (${period.end.toISOString()}::timestamptz AT TIME ZONE 'UTC')
      GROUP BY 1, 2
    `;

    const byDay = new Map<string, DayRow>();
    for (const row of rows) {
      const day = byDay.get(row.day) ?? { day: row.day, ...emptyFunnel() };
      addToFunnel(day, row.status, Number(row.n));
      byDay.set(row.day, day);
    }
    return fillDays([...byDay.values()], period);
  }

  /**
   * Разбивка по материалам и рассылкам без документа.
   *
   * Письма материала бывают из разных шаблонов (выдача, реклама,
   * уведомление о сроке) — для человека это всё письма одного
   * награждения, и складываются они в одну строку.
   */
  private async bySource(orgId: string, period: Period): Promise<SourceRow[]> {
    const groups = await this.prisma.email.groupBy({
      by: ['documentId', 'templateId', 'status'],
      where: { orgId, queuedAt: { gte: period.start, lt: period.end } },
      _count: { _all: true },
    });

    const funnels = new Map<string, { type: SourceRow['type']; id: string; funnel: Funnel }>();
    for (const group of groups) {
      const source = group.documentId
        ? { type: 'document' as const, id: group.documentId }
        : group.templateId
          ? { type: 'mailing' as const, id: group.templateId }
          : null;
      // Письмо без материала и без шаблона — служебное, не рассылка.
      if (!source) continue;

      const key = `${source.type}:${source.id}`;
      const entry = funnels.get(key) ?? { ...source, funnel: emptyFunnel() };
      addToFunnel(entry.funnel, group.status as EmailStatus, group._count._all);
      funnels.set(key, entry);
    }

    const entries = [...funnels.values()];
    const ids = (type: SourceRow['type']) =>
      entries.filter((e) => e.type === type).map((e) => e.id);

    const [documents, mailings] = await Promise.all([
      this.prisma.document.findMany({
        where: { id: { in: ids('document') }, orgId },
        select: { id: true, title: true, eventName: true },
      }),
      this.prisma.emailTemplate.findMany({
        where: { id: { in: ids('mailing') }, orgId, documentId: null },
        select: { id: true, name: true },
      }),
    ]);
    const docs = new Map(documents.map((d) => [d.id, d]));
    const names = new Map(mailings.map((m) => [m.id, m.name ?? '']));

    return entries
      .map((entry) => {
        const doc = entry.type === 'document' ? docs.get(entry.id) : undefined;
        return {
          id: entry.id,
          type: entry.type,
          title: doc?.title ?? names.get(entry.id) ?? '',
          eventName: doc?.eventName ?? '',
          ...entry.funnel,
        };
      })
      .sort((a, b) => b.total - a.total)
      .slice(0, SOURCES_LIMIT);
  }
}
