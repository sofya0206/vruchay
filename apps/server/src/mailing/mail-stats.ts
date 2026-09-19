import type { EmailStatus } from '../mail/email-status';

/**
 * Сводка по письмам за отрезок времени — расчёт без базы.
 *
 * Здесь только то, что можно ошибиться посчитать: границы дней по Москве,
 * нарастающий итог по состояниям и пустые дни в ряду. Запросы к базе
 * живут в сервисе и отдают сюда голые счётчики.
 */

/** Москва без перехода на летнее время с 2014 года: сдвиг постоянный. */
const MSK_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Больше года сводка не охватывает: ряд из тысячи дней не читается. */
export const MAX_PERIOD_DAYS = 366;
export const DEFAULT_PERIOD_DAYS = 30;

export interface Period {
  /** Первый и последний день отрезка по Москве, включительно: «2026-09-01». */
  from: string;
  to: string;
  /** Те же границы мгновениями: [start, end). */
  start: Date;
  end: Date;
}

/** Календарный день по Москве для мгновения. */
export function moscowDay(date: Date): string {
  return new Date(date.getTime() + MSK_OFFSET_MS).toISOString().slice(0, 10);
}

/** Полночь по Москве в начале дня «2026-09-01». */
function moscowMidnight(day: string): Date {
  return new Date(Date.parse(`${day}T00:00:00.000Z`) - MSK_OFFSET_MS);
}

function shiftDay(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00.000Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/**
 * Отрезок из запроса.
 *
 * Без дат — последние тридцать дней, считая сегодняшний. Перевёрнутый
 * отрезок и отрезок длиннее года — ошибка ввода, а не повод молча
 * подрезать: человек должен видеть ровно тот отрезок, который выбрал.
 */
export function resolvePeriod(
  query: { from?: string; to?: string },
  now = new Date(),
): Period | { error: string } {
  const to = query.to ?? moscowDay(now);
  const from = query.from ?? shiftDay(to, -(DEFAULT_PERIOD_DAYS - 1));

  if (from > to) return { error: 'Начало отрезка позже конца' };
  if (daysBetween(from, to) > MAX_PERIOD_DAYS) {
    return { error: `Отрезок не длиннее ${MAX_PERIOD_DAYS} дней` };
  }

  return { from, to, start: moscowMidnight(from), end: moscowMidnight(shiftDay(to, 1)) };
}

/** Сколько дней в отрезке, считая оба конца. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS) + 1;
}

/**
 * Воронка письма.
 *
 * Нарастающим итогом, как в реестре: прочитанное письмо и доставлено,
 * и отправлено. Отказ ящика («bounced») тоже отправлен — оно ушло от нас
 * и вернулось, — а отказ шлюза («failed») не ушёл вовсе.
 */
export interface Funnel {
  total: number;
  sent: number;
  delivered: number;
  opened: number;
  failed: number;
  queued: number;
}

const SENT: EmailStatus[] = ['sent', 'delivered', 'opened', 'bounced'];
const DELIVERED: EmailStatus[] = ['delivered', 'opened'];
const FAILED: EmailStatus[] = ['bounced', 'failed'];

export function emptyFunnel(): Funnel {
  return { total: 0, sent: 0, delivered: 0, opened: 0, failed: 0, queued: 0 };
}

/** Прибавить к воронке письма одного состояния. */
export function addToFunnel(funnel: Funnel, status: EmailStatus, count: number): Funnel {
  funnel.total += count;
  if (SENT.includes(status)) funnel.sent += count;
  if (DELIVERED.includes(status)) funnel.delivered += count;
  if (status === 'opened') funnel.opened += count;
  if (FAILED.includes(status)) funnel.failed += count;
  if (status === 'queued') funnel.queued += count;
  return funnel;
}

export interface DayRow extends Funnel {
  day: string;
}

/**
 * Ряд по дням без дыр.
 *
 * База отдаёт только дни, в которые что-то уходило. Пропуск на графике
 * читается как «данных нет», а на деле это ноль — и ноль должен стоять.
 */
export function fillDays(rows: DayRow[], period: Pick<Period, 'from' | 'to'>): DayRow[] {
  const byDay = new Map(rows.map((row) => [row.day, row]));
  const result: DayRow[] = [];
  for (let day = period.from; day <= period.to; day = shiftDay(day, 1)) {
    result.push(byDay.get(day) ?? { day, ...emptyFunnel() });
  }
  return result;
}
