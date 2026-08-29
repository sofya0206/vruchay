import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SENT_STATUSES, issuedAnywhere } from './scope';
import {
  CHECK_ACTIONS,
  FUNNEL_STEPS,
  STEP_LABELS,
  TIME_TO_FIRST_TARGET_MINUTES,
  countSteps,
  median,
  minutesBetween,
  mskDay,
  share,
  stepsReached,
  type StepsReached,
} from './activation';

/**
 * Воронка активации по всем организациям сразу.
 *
 * Нужна нам самим, а не клиенту: она отвечает на вопрос, где люди
 * отваливаются между регистрацией и первым разосланным пакетом.
 *
 * В ответе только числа организаций. Ни названий, ни идентификаторов,
 * ни тем более сведений о людях: воронка — это статистика, и превращать
 * её в наблюдение за конкретными клиентами не нужно ни для одного
 * решения, которое по ней принимается. Персональный трекинг сделал бы
 * нас самостоятельным оператором персональных данных со всей полнотой
 * ответственности по 152-ФЗ — при том, что данные участников нам
 * доверены для обработки по поручению организаций.
 */
@Injectable()
export class FunnelService {
  constructor(private readonly prisma: PrismaService) {}

  async platform(now = new Date()) {
    const issued = issuedAnywhere();

    const [orgs, imported, checkTraces, startedJobs, byOrgDocument, mailed, jobsByStatus, cleanJobs, reissued] =
      await Promise.all([
        // Две колонки на организацию: воронка обязана посчитать всех,
        // поэтому предела здесь нет, но и читать больше нечего.
        this.prisma.organization.findMany({ select: { id: true, createdAt: true } }),
        this.prisma.document.findMany({
          where: { rows: { some: {} } },
          select: { orgId: true },
          distinct: ['orgId'],
        }),
        this.prisma.auditEvent.groupBy({
          by: ['orgId'],
          where: { action: { in: [...CHECK_ACTIONS] } },
          _count: { _all: true },
        }),
        this.prisma.generationJob.groupBy({ by: ['orgId'], _count: { _all: true } }),
        /*
         * Один запрос отвечает сразу на три вопроса: кто выпускал, когда
         * выпустил впервые и по скольким разным материалам. Строк здесь
         * столько, сколько у организаций материалов, — не столько,
         * сколько выдано документов.
         */
        this.prisma.file.groupBy({
          by: ['orgId', 'documentId'],
          where: issued,
          _min: { createdAt: true },
          _count: { _all: true },
          _sum: { verifyCount: true },
        }),
        this.prisma.email.groupBy({
          by: ['orgId'],
          where: { status: { in: [...SENT_STATUSES] } },
          _count: { _all: true },
        }),
        this.prisma.generationJob.groupBy({ by: ['status'], _count: { _all: true } }),
        this.prisma.generationJob.count({ where: { status: 'done', failed: 0 } }),
        this.prisma.file.count({
          where: {
            ...issued,
            OR: [{ replacedById: { not: null } }, { replacedByJobId: { not: null } }],
          },
        }),
      ]);

    const withRows = new Set(imported.map((d) => d.orgId));
    const withCheck = new Set(checkTraces.map((e) => e.orgId));
    const withJobs = new Set(startedJobs.map((j) => j.orgId));
    const withMail = new Set(mailed.map((e) => e.orgId));

    /** Первые выпуски по каждому материалу — по организациям. */
    const firstIssues = new Map<string, Date[]>();
    let issuedTotal = 0;
    let verificationsTotal = 0;
    for (const group of byOrgDocument) {
      issuedTotal += group._count._all;
      verificationsTotal += group._sum.verifyCount ?? 0;
      const at = group._min.createdAt;
      if (!at) continue;
      const list = firstIssues.get(group.orgId) ?? [];
      list.push(at);
      firstIssues.set(group.orgId, list);
    }

    const reached: StepsReached[] = [];
    const minutesToFirst: number[] = [];

    for (const org of orgs) {
      const issues = firstIssues.get(org.id) ?? [];
      reached.push(
        stepsReached({
          hasRows: withRows.has(org.id),
          usedCheck: withCheck.has(org.id),
          startedJob: withJobs.has(org.id),
          hasIssued: issues.length > 0,
          hasMailed: withMail.has(org.id),
          issueDays: new Set(issues.map(mskDay)).size,
        }),
      );

      if (issues.length > 0) {
        const first = issues.reduce((min, d) => (d < min ? d : min));
        minutesToFirst.push(minutesBetween(org.createdAt, first));
      }
    }

    const counted = countSteps(reached);
    const inTarget = minutesToFirst.filter((m) => m <= TIME_TO_FIRST_TARGET_MINUTES).length;

    const jobs = new Map(jobsByStatus.map((j) => [j.status, j._count._all]));
    const finishedJobs = (jobs.get('done') ?? 0) + (jobs.get('failed') ?? 0);

    return {
      /** Момент расчёта: воронка считается на лету и ничего не кэширует. */
      at: now,
      organizations: orgs.length,
      steps: FUNNEL_STEPS.map((key) => ({
        key,
        label: STEP_LABELS[key],
        organizations: counted[key],
        // Доля от зарегистрировавшихся, а не от предыдущего шага: так
        // видно, сколько людей вообще доходит до дела, а не только
        // где обрыв круче.
        share: share(counted[key], orgs.length),
      })),
      timeToFirst: {
        targetMinutes: TIME_TO_FIRST_TARGET_MINUTES,
        organizations: minutesToFirst.length,
        medianMinutes: median(minutesToFirst),
        inTarget,
        inTargetShare: share(inTarget, minutesToFirst.length),
      },
      packages: {
        finished: finishedJobs,
        clean: cleanJobs,
        cleanShare: share(cleanJobs, finishedJobs),
      },
      reissues: {
        issued: issuedTotal,
        count: reissued,
        share: share(reissued, issuedTotal),
      },
      verifications: { total: verificationsTotal },
      /**
       * Оговорка к шагу «прошли проверку»: точного следа у него нет,
       * см. CHECK_ACTIONS. Возвращаем текстом, чтобы цифру не читали
       * точнее, чем она есть.
       */
      notes: {
        checked:
          'Считается по правкам списка после проверки и по запущенным выпускам: ' +
          'отдельной отметки «список проверен» в базе пока нет.',
      },
    };
  }
}
