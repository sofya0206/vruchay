import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OrgService } from '../org/org.service';

/** Москва круглый год UTC+3: перехода на летнее время в стране нет. */
const MSK_OFFSET_MS = 3 * 60 * 60 * 1000;

/**
 * Начало месяца по московскому времени.
 *
 * Считаем от Москвы, а не от часового пояса сервера: «за этот месяц» —
 * это то, что человек сверяет со своим календарём, а сервер живёт в UTC.
 * Первого числа до трёх часов ночи разница видна невооружённым глазом:
 * выпущенное вчера вечером попало бы уже в новый месяц.
 *
 * `shiftMonths` сдвигает границу на соседние месяцы: −1 — начало прошлого,
 * +1 — начало следующего. Нужно аналитике и месячной сводке, которым
 * помимо начала периода нужен и его конец. Отдельной функции для этого
 * не заводим намеренно: две константы московского времени в одном
 * приложении однажды разойдутся.
 */
export function monthStart(now: Date, shiftMonths = 0): Date {
  const msk = new Date(now.getTime() + MSK_OFFSET_MS);
  return new Date(
    Date.UTC(msk.getUTCFullYear(), msk.getUTCMonth() + shiftMonths, 1) - MSK_OFFSET_MS,
  );
}

/** Сколько последних материалов и заданий показываем на рабочем столе. */
const RECENT_LIMIT = 5;

/**
 * Письмо считается ушедшим, когда его принял почтовый шлюз. Открытие —
 * тоже отправка, просто с известной судьбой; в очереди и в отказе — нет.
 */
const SENT_STATUSES = ['sent', 'delivered', 'opened'] as const;

/** Письмо дошло: шлюз подтвердил доставку или человек его открыл. */
const DELIVERED_STATUSES = ['delivered', 'opened'] as const;

/** Письмо не дошло: отказ ящика или отказ шлюза — для человека одно и то же. */
const UNDELIVERED_STATUSES = ['bounced', 'failed'] as const;

/**
 * Сводка для рабочего стола кабинета.
 *
 * Один запрос на весь экран: метрики, остаток пробы и последние
 * мероприятия. Иначе главная страница дёргала бы сервер пятью разными
 * адресами и собиралась бы на глазах у человека по кускам.
 *
 * Всё считается агрегатами по своей организации. Строки в память не
 * выбираются нигде: у организации с сотней тысяч выпущенных документов
 * рабочий стол должен открываться так же, как у новой.
 */
@Injectable()
export class OverviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly org: OrgService,
  ) {}

  async summary(orgId: string, now = new Date()) {
    const since = monthStart(now);
    const prevSince = monthStart(now, -1);

    const [
      usage,
      issuedTotal,
      issuedMonth,
      emailsSent,
      materials,
      documents,
      jobs,
      issuedPrevMonth,
      emailsDelivered,
      emailsUndelivered,
      verifiedMonth,
      verifications,
    ] = await Promise.all([
      // Остаток берём у той же службы, что решает, пускать ли к выпуску:
      // разойдись эти две цифры — человек упёрся бы в предел, видя запас.
      this.org.usage(orgId),
      // Выпущенное за всё время считаем отдельно: израсходованное по плану —
      // это документы с начала плана, а «за всё время» на рабочем столе
      // означает ровно то, что написано.
      this.prisma.file.count({ where: { orgId, kind: 'generated' } }),
      this.prisma.file.count({
        where: { orgId, kind: 'generated', createdAt: { gte: since } },
      }),
      this.prisma.email.count({ where: { orgId, status: { in: [...SENT_STATUSES] } } }),
      this.prisma.document.count({ where: { orgId, deletedAt: null } }),
      this.prisma.document.findMany({
        where: { orgId, deletedAt: null },
        orderBy: { updatedAt: 'desc' },
        take: RECENT_LIMIT,
        select: { id: true, title: true, eventName: true, eventDate: true, updatedAt: true },
      }),
      this.prisma.generationJob.findMany({
        where: { orgId },
        orderBy: { createdAt: 'desc' },
        take: RECENT_LIMIT,
        select: {
          id: true,
          documentId: true,
          status: true,
          total: true,
          done: true,
          failed: true,
          createdAt: true,
          document: { select: { title: true } },
        },
      }),
      /*
       * Прошлый месяц — ради стрелки рядом с «выпущено за месяц»:
       * одна цифра без сравнения ничего не говорит, а сравнение
       * с прошлым месяцем — то, что человек и так прикидывает в уме.
       */
      this.prisma.file.count({
        where: { orgId, kind: 'generated', createdAt: { gte: prevSince, lt: since } },
      }),
      this.prisma.email.count({ where: { orgId, status: { in: [...DELIVERED_STATUSES] } } }),
      this.prisma.email.count({ where: { orgId, status: { in: [...UNDELIVERED_STATUSES] } } }),
      /*
       * Документов, которые проверяли по QR в этом месяце. Именно
       * документов: у файла хранится счётчик и дата последней проверки,
       * истории по датам нет — так же считает и аналитика.
       */
      this.prisma.file.count({
        where: { orgId, kind: 'generated', verifyLastAt: { gte: since } },
      }),
      this.prisma.file.aggregate({
        where: { orgId, kind: 'generated' },
        _sum: { verifyCount: true },
      }),
    ]);

    return {
      usage,
      /** Выпущено за всё время — те же созданные файлы, по которым считается квота. */
      issuedTotal,
      issuedMonth,
      issuedPrevMonth,
      emailsSent,
      mail: {
        delivered: emailsDelivered,
        undelivered: emailsUndelivered,
      },
      /** Документов, проверенных по QR с начала месяца, и проверок за всё время. */
      verifiedMonth,
      verificationsTotal: verifications._sum.verifyCount ?? 0,
      /** Материалов в работе. Ноль означает, что организация ещё ничего не начинала. */
      materials,
      documents: documents.map((d) => ({
        id: d.id,
        title: d.title,
        eventName: d.eventName,
        eventDate: d.eventDate,
        updatedAt: d.updatedAt,
      })),
      jobs: jobs.map((j) => ({
        id: j.id,
        documentId: j.documentId,
        documentTitle: j.document.title,
        status: j.status,
        total: j.total,
        done: j.done,
        failed: j.failed,
        createdAt: j.createdAt,
      })),
    };
  }
}
