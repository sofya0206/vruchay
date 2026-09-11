import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SENT_STATUSES, issuedByOrg } from './scope';
import {
  CHECK_ACTIONS,
  FUNNEL_STEPS,
  STEP_LABELS,
  TIME_TO_FIRST_TARGET_MINUTES,
  minutesBetween,
  monthRange,
  monthTitle,
  mskDay,
  share,
  stepsReached,
} from './activation';

/** Числа за календарный месяц: ими пользуются и раздел, и письмо-сводка. */
export interface MonthNumbers {
  /** «август 2026» */
  title: string;
  issued: number;
  mailed: number;
  /**
   * Сколько выданных документов проверяли по QR в этом месяце.
   *
   * Именно документов, а не проверок: у файла хранится обезличенный
   * счётчик и дата последней проверки, истории по датам нет. Число
   * проверок за период из этих данных не считается — за ним нужно поле
   * от ветки A (см. «Что сделано» в задании).
   */
  verifiedFiles: number;
}

/**
 * Цифры по одной организации — те, с которыми идут на переговоры.
 *
 * Всё считается агрегатами по своей организации: строки в память
 * не выбираются нигде, чтобы у организации с сотней тысяч документов
 * раздел открывался так же быстро, как у новой.
 *
 * Условие «что считать выданным» берём у реестра (`registryWhere`),
 * а не выписываем заново: приёмка требует, чтобы цифры сходились
 * с тем, что человек видит руками в таблице, а два одинаковых на вид
 * условия однажды разойдутся — и разойдутся молча.
 */
@Injectable()
export class MetricsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Условие «выданное» — ровно то же, по которому строится реестр. */
  private issued(orgId: string): Prisma.FileWhereInput {
    return issuedByOrg(orgId);
  }

  async forOrg(orgId: string, now = new Date()) {
    const issued = this.issued(orgId);
    const thisMonth = monthRange(now);
    const lastMonth = monthRange(now, 1);

    const [
      org,
      totals,
      verifiedFiles,
      reissued,
      byDocument,
      jobsByStatus,
      cleanJobs,
      materialsWithRows,
      checkTraces,
      mailedTotal,
      current,
      previous,
    ] = await Promise.all([
      this.prisma.organization.findUnique({
        where: { id: orgId },
        select: { createdAt: true },
      }),
      this.prisma.file.aggregate({
        where: issued,
        _count: { _all: true },
        _sum: { verifyCount: true },
      }),
      this.prisma.file.count({ where: { ...issued, verifyCount: { gt: 0 } } }),
      /*
       * Перевыпуски считаем и состоявшиеся, и обещанные. Обещание — это
       * уже признание, что выданный документ оказался неверным; то, что
       * замена ещё не готова, ничего в этом не меняет.
       */
      this.prisma.file.count({
        where: {
          ...issued,
          OR: [{ replacedById: { not: null } }, { replacedByJobId: { not: null } }],
        },
      }),
      this.prisma.file.groupBy({
        by: ['documentId'],
        where: issued,
        _min: { createdAt: true },
      }),
      this.prisma.generationJob.groupBy({
        by: ['status'],
        where: { orgId },
        _count: { _all: true },
      }),
      this.prisma.generationJob.count({ where: { orgId, status: 'done', failed: 0 } }),
      this.prisma.document.count({ where: { orgId, rows: { some: {} } } }),
      this.prisma.auditEvent.count({ where: { orgId, action: { in: [...CHECK_ACTIONS] } } }),
      this.prisma.email.count({ where: { orgId, status: { in: [...SENT_STATUSES] } } }),
      this.forMonth(orgId, thisMonth.from, thisMonth.to),
      this.forMonth(orgId, lastMonth.from, lastMonth.to),
    ]);

    // Организация из сессии и не найтись-то не может; проверка стоит,
    // чтобы дальше не считать воронку от несуществующей даты регистрации.
    if (!org) throw new NotFoundException('Организация не найдена');

    const firstIssues = byDocument
      .map((d) => d._min.createdAt)
      .filter((date): date is Date => date !== null);
    const firstIssuedAt =
      firstIssues.length > 0 ? firstIssues.reduce((min, d) => (d < min ? d : min)) : null;

    const jobs = new Map(jobsByStatus.map((j) => [j.status, j._count._all]));
    const startedJobs = [...jobs.values()].reduce((sum, n) => sum + n, 0);
    /*
     * Знаменатель доли «без ошибок» — законченные пакеты. Отменённые
     * в него не входят: человек передумал сам, и записывать это себе
     * в ошибки значило бы прятать настоящие.
     */
    const finishedJobs = (jobs.get('done') ?? 0) + (jobs.get('failed') ?? 0);

    const totalIssued = totals._count._all;
    const steps = stepsReached({
      hasRows: materialsWithRows > 0,
      usedCheck: checkTraces > 0,
      startedJob: startedJobs > 0,
      hasIssued: totalIssued > 0,
      hasMailed: mailedTotal > 0,
      issueDays: new Set(firstIssues.map(mskDay)).size,
    });

    return {
      registeredAt: org.createdAt,
      activation: {
        steps: FUNNEL_STEPS.map((key) => ({ key, label: STEP_LABELS[key], done: steps[key] })),
      },
      timeToFirst: {
        firstIssuedAt,
        minutes: firstIssuedAt ? minutesBetween(org.createdAt, firstIssuedAt) : null,
        targetMinutes: TIME_TO_FIRST_TARGET_MINUTES,
      },
      issued: totalIssued,
      mailed: mailedTotal,
      /*
       * Главная цифра раздела и лучший довод на продление: каждая проверка —
       * это чей-то работодатель, приёмная комиссия или судья, отсканировавшие
       * QR-код с выданного бланка. Считаем только число: кто и откуда
       * проверял, мы не собираем и собирать не станем.
       */
      verifications: {
        total: totals._sum.verifyCount ?? 0,
        files: verifiedFiles,
      },
      packages: {
        started: startedJobs,
        finished: finishedJobs,
        clean: cleanJobs,
        cleanShare: share(cleanJobs, finishedJobs),
      },
      reissues: {
        count: reissued,
        share: share(reissued, totalIssued),
      },
      thisMonth: current,
      lastMonth: previous,
    };
  }

  /**
   * Числа за один календарный месяц.
   *
   * Тремя счётчиками, а не выборкой строк с раскладкой по месяцам
   * в памяти: за год у организации набегают десятки тысяч документов,
   * и вытаскивать их ради трёх чисел нельзя.
   */
  async forMonth(orgId: string, from: Date, to: Date): Promise<MonthNumbers> {
    const issued = this.issued(orgId);

    const [issuedCount, mailedCount, verifiedCount] = await Promise.all([
      this.prisma.file.count({ where: { ...issued, createdAt: { gte: from, lt: to } } }),
      this.prisma.email.count({
        where: { orgId, status: { in: [...SENT_STATUSES] }, sentAt: { gte: from, lt: to } },
      }),
      this.prisma.file.count({ where: { ...issued, verifyLastAt: { gte: from, lt: to } } }),
    ]);

    return {
      title: monthTitle(from),
      issued: issuedCount,
      mailed: mailedCount,
      verifiedFiles: verifiedCount,
    };
  }

  /** Проверок по QR за всё время — цифра, которую называют при продлении. */
  async verificationsTotal(orgId: string): Promise<number> {
    const totals = await this.prisma.file.aggregate({
      where: this.issued(orgId),
      _sum: { verifyCount: true },
    });
    return totals._sum.verifyCount ?? 0;
  }
}
