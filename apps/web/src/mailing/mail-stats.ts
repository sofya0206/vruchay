import type { Funnel, StatsSource } from './api';

/** Отрезки сводки: последние N дней, считая сегодняшний. */
export type StatsRange = '7' | '30' | '90' | '365';

export const STATS_RANGES: { id: StatsRange; label: string }[] = [
  { id: '7', label: '7 дней' },
  { id: '30', label: '30 дней' },
  { id: '90', label: '90 дней' },
  { id: '365', label: 'Год' },
];

export function statsRange(param: string | null): StatsRange {
  return STATS_RANGES.find((r) => r.id === param)?.id ?? '30';
}

const MSK_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Сегодня по Москве — тот же день, которым считает сервер. */
function moscowDay(date: Date): string {
  return new Date(date.getTime() + MSK_OFFSET_MS).toISOString().slice(0, 10);
}

export function rangePeriod(range: StatsRange, now = new Date()): { from: string; to: string } {
  const to = moscowDay(now);
  const from = new Date(Date.parse(to) - (Number(range) - 1) * DAY_MS).toISOString().slice(0, 10);
  return { from, to };
}

/**
 * Доля от писем, прошедших очередь, целыми процентами.
 *
 * Письма в очереди в знаменатель не входят: они ещё не могли ни дойти,
 * ни открыться, и занижать ими долю прочтения нечестно.
 */
export function share(
  part: number,
  funnel: Pick<Funnel, 'sent' | 'failed' | 'total' | 'queued'>,
): string {
  const base = funnel.total - funnel.queued;
  if (base <= 0) return '—';
  const value = Math.round((part / base) * 100);
  // Одно письмо из тысячи — не ноль: ноль читается как «никто».
  if (value === 0 && part > 0) return '<1%';
  return `${value}%`;
}

/**
 * Разбивка по мероприятиям.
 *
 * Мероприятие — поле материала, а не отдельная запись: награждение
 * «Осенний кубок» обычно выпускает три материала (грамоты, дипломы,
 * сертификаты участника), и спрашивают про него целиком. Рассылки
 * без документа мероприятия не имеют и стоят своей строкой.
 */
export function groupByEvent(sources: StatsSource[]): StatsSource[] {
  const groups = new Map<string, StatsSource>();
  for (const source of sources) {
    const event = source.eventName.trim();
    const key = source.type === 'mailing' ? `mailing:${source.id}` : `event:${event}`;
    const title = source.type === 'mailing' ? source.title : event || 'Мероприятие не указано';
    const group = groups.get(key) ?? {
      id: key,
      type: source.type,
      title,
      eventName: event,
      total: 0,
      sent: 0,
      delivered: 0,
      opened: 0,
      failed: 0,
      queued: 0,
    };
    for (const field of FUNNEL_FIELDS) group[field] += source[field];
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => b.total - a.total);
}

const FUNNEL_FIELDS: (keyof Funnel)[] = [
  'total',
  'sent',
  'delivered',
  'opened',
  'failed',
  'queued',
];

const DAY_LABEL = new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'UTC',
  day: 'numeric',
  month: 'short',
});

/** «15 сент.» — день ряда уже московский, поэтому форматируем как UTC. */
export function dayLabel(day: string): string {
  return DAY_LABEL.format(new Date(`${day}T00:00:00Z`));
}
