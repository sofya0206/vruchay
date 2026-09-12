import type { LogItem, MailingLog } from './api';

/**
 * Списки раздела «Письма».
 *
 * Раздел устроен как почтовая программа: слева состояния писем папками,
 * справа сами письма. Список отдельным модулем, а не разметкой внутри
 * страницы: по нему же разбирается адрес, и папка, на которую можно
 * сослаться, не может разойтись с папкой, которая нарисована.
 *
 * Ушедшее, доставленное и прочитанное — одна папка «Доставлено»: это
 * жизнь одного письма, и три папки заставляли искать его по очереди.
 * Что именно с письмом — видно по чипу в строке.
 */
export type MailList = 'all' | 'queued' | 'delivered' | 'undelivered' | 'lists' | 'new';

export interface MailListInfo {
  id: MailList;
  label: string;
  /** Состояния писем, попадающие в папку. Пусто — папка со всеми письмами. */
  statuses: LogItem['status'][];
  /** Что написано на пустом месте: заголовок и строка объяснения. */
  emptyTitle: string;
  emptyHint: string;
}

/**
 * Папки писем — в порядке жизни письма: встало в очередь, ушло, дошло,
 * прочитано. Отказ шлюза и отказ ящика лежат в одной папке: для человека
 * это одно и то же «не дошло», и разводить их по двум строкам значит
 * заставить его выбирать между словами, которых он не различает.
 */
export const LETTER_LISTS: MailListInfo[] = [
  {
    id: 'all',
    label: 'Все письма',
    statuses: [],
    emptyTitle: 'Письма',
    emptyHint: 'Все письма, отправленные вами, будут на этой странице.',
  },
  {
    id: 'queued',
    label: 'В очереди',
    statuses: ['queued'],
    emptyTitle: 'Очередь пуста',
    emptyHint: 'Здесь письма ждут отправки — обычно всего несколько минут.',
  },
  {
    id: 'delivered',
    label: 'Доставлено',
    statuses: ['sent', 'delivered', 'opened'],
    emptyTitle: 'Доставленных писем нет',
    emptyHint: 'Сюда попадают письма, которые ушли получателю; прочитанные отмечены.',
  },
  {
    id: 'undelivered',
    label: 'Не доставлено',
    statuses: ['bounced', 'failed'],
    emptyTitle: 'Недоставленных писем нет',
    emptyHint: 'Письма, которые не дошли до получателя, окажутся здесь с причиной отказа.',
  },
];

/** Папки, в которых лежат не письма, а работа с ними. */
export const OTHER_LABELS: Record<'lists' | 'new', string> = {
  lists: 'Списки получателей',
  new: 'Новая рассылка',
};

export function letterList(id: MailList): MailListInfo | null {
  return LETTER_LISTS.find((item) => item.id === id) ?? null;
}

export function mailListLabel(id: MailList): string {
  return letterList(id)?.label ?? OTHER_LABELS[id as 'lists' | 'new'];
}

/**
 * Какую папку открыть по адресу `?list=`.
 *
 * Незнакомое значение не ошибка, а устаревшая ссылка: показываем все
 * письма — то, ради чего в раздел приходят чаще всего.
 */
export function mailList(param: string | null): MailList {
  const known: MailList[] = [...LETTER_LISTS.map((item) => item.id), 'lists', 'new'];
  return known.find((id) => id === param) ?? 'all';
}

/** Адрес папки — одно место, где он собирается. */
export function mailListPath(id: MailList): string {
  return id === 'all' ? '/mailing' : `/mailing?list=${id}`;
}

/**
 * Сколько писем в папке.
 *
 * Считает сервер по всем письмам организации, а не по тем двум сотням,
 * что показаны в списке: число рядом с папкой должно отвечать на вопрос
 * «сколько их всего», а не «сколько влезло на экран».
 */
export function listCount(id: MailList, summary: MailingLog['summary']): number {
  const info = letterList(id);
  if (!info) return 0;
  const statuses = info.statuses.length > 0 ? info.statuses : ALL_STATUSES;
  return statuses.reduce((sum, status) => sum + (summary[status] ?? 0), 0);
}

const ALL_STATUSES: LogItem['status'][] = [
  'queued',
  'sent',
  'delivered',
  'opened',
  'bounced',
  'failed',
];

export function matchesList(item: LogItem, id: MailList): boolean {
  const info = letterList(id);
  if (!info || info.statuses.length === 0) return true;
  return info.statuses.includes(item.status);
}

/**
 * Поиск по письмам.
 *
 * По адресу, теме и материалу сразу: человек помнит что-то одно из трёх —
 * фамилию в адресе, слово из темы или название мероприятия, — и заставлять
 * его выбирать поле для поиска значит не найти ничего.
 */
export function matchesSearch(item: LogItem, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [item.toEmail, item.subject, item.documentTitle].some((value) =>
    value.toLowerCase().includes(needle),
  );
}

export type MailPeriod = 'all' | 'today' | 'week' | 'month';

export const MAIL_PERIODS: { id: MailPeriod; label: string }[] = [
  { id: 'all', label: 'Всё время' },
  { id: 'today', label: 'Сегодня' },
  { id: 'week', label: 'Неделя' },
  { id: 'month', label: 'Месяц' },
];

const MSK = 'Europe/Moscow';

/** Календарный день по Москве в виде «2026-08-28» — для сравнения дат. */
const ISO_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: MSK,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const TIME = new Intl.DateTimeFormat('ru-RU', {
  timeZone: MSK,
  hour: '2-digit',
  minute: '2-digit',
});
const DAY = new Intl.DateTimeFormat('ru-RU', { timeZone: MSK, day: '2-digit', month: '2-digit' });
const DAY_YEAR = new Intl.DateTimeFormat('ru-RU', {
  timeZone: MSK,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

/**
 * Отрезок времени. День считаем по Москве, а не по часам от «сейчас»:
 * «сегодня» для человека — это календарный день, а не последние сутки.
 * Испорченную дату не прячем — письмо с ней должно остаться видимым.
 */
export function withinPeriod(iso: string, period: MailPeriod, now = new Date()): boolean {
  if (period === 'all') return true;

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return true;

  if (period === 'today') return ISO_DAY.format(date) === ISO_DAY.format(now);

  const days = period === 'week' ? 7 : 30;
  return now.getTime() - date.getTime() <= days * 24 * 60 * 60 * 1000;
}

/**
 * Когда письмо ушло: у сегодняшних только время, у остальных дата и время.
 *
 * Год пишем только у прошлогодних: «28.08.2026, 14:32» на вчерашнем письме
 * читается как архивная запись, а не как «вчера днём».
 */
export function formatLetterTime(iso: string, now = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';

  const day = ISO_DAY.format(date);
  const today = ISO_DAY.format(now);
  if (day === today) return TIME.format(date);

  const sameYear = day.slice(0, 4) === today.slice(0, 4);
  return `${(sameYear ? DAY : DAY_YEAR).format(date)}, ${TIME.format(date)}`;
}
