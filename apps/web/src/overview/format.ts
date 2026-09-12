import type { JobStatus } from '../api/overview';

/*
 * Даты и подписи рабочего стола.
 *
 * Вынесено из разметки, потому что это единственное здесь, что можно
 * сделать неправильно незаметно: московский день, склонение слова
 * «документ» и понятное название состояния задания.
 */

const MSK = 'Europe/Moscow';

/** Календарный день по Москве в виде «2026-08-28» — для сравнения дат. */
function mskDay(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: MSK,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * Когда это было: «сегодня», «вчера» или дата.
 *
 * Свежесть важнее точности: список последних мероприятий человек читает,
 * чтобы понять, чем он занимался только что, а не чтобы свериться
 * с календарём. Год добавляем только к прошлым годам — «28 августа
 * 2026 года» на позавчерашнем задании выглядит архивом.
 */
export function formatWhen(iso: string, now = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';

  const day = mskDay(date);
  const today = mskDay(now);
  if (day === today) return 'сегодня';

  const yesterday = mskDay(new Date(now.getTime() - 24 * 60 * 60 * 1000));
  if (day === yesterday) return 'вчера';

  const sameYear = day.slice(0, 4) === today.slice(0, 4);
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: MSK,
    day: 'numeric',
    month: 'long',
    ...(sameYear ? {} : { year: 'numeric' }),
  }).format(date);
}

export interface JobLook {
  label: string;
  tone: 'neutral' | 'progress' | 'done' | 'error';
}

/**
 * Состояние задания на выпуск словами получателя, а не очереди.
 *
 * «Готово, часть с ошибками» — отдельная подпись, а не просто «готово»:
 * задание, где не выпустилась половина строк, закончилось успешно только
 * с точки зрения очереди.
 */
export function jobLook(status: JobStatus, failed = 0): JobLook {
  switch (status) {
    case 'queued':
      return { label: 'в очереди', tone: 'neutral' };
    case 'running':
      return { label: 'идёт выпуск', tone: 'progress' };
    case 'done':
      return failed > 0
        ? { label: 'готово, часть с ошибками', tone: 'progress' }
        : { label: 'готово', tone: 'done' };
    case 'failed':
      // Единственное состояние задания, на которое надо реагировать, —
      // серым, как «отменено», оно терялось.
      return { label: 'не удалось', tone: 'error' };
    case 'canceled':
      return { label: 'отменено', tone: 'neutral' };
  }
}

/**
 * Название материала, который заводится под протокол одним нажатием.
 *
 * С датой, потому что мероприятий за сезон десятки и на один бланк:
 * без даты в списке материалов оказалось бы пять «Мероприятий» подряд,
 * и человек не отличил бы вчерашнее от прошлогоднего. Переименовать
 * его можно в любой момент.
 */
export function protocolTitle(now = new Date()): string {
  const date = new Intl.DateTimeFormat('ru-RU', {
    timeZone: MSK,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(now);
  return `Мероприятие от ${date}`;
}

const MONTHS_IN = [
  'январе', 'феврале', 'марте', 'апреле', 'мае', 'июне',
  'июле', 'августе', 'сентябре', 'октябре', 'ноябре', 'декабре',
];
const MONTHS_TO = [
  'январю', 'февралю', 'марту', 'апрелю', 'маю', 'июню',
  'июлю', 'августу', 'сентябрю', 'октябрю', 'ноябрю', 'декабрю',
];

/** Номер текущего месяца по Москве, 0–11: граница месяца та же, что у сервера. */
function mskMonth(now: Date): number {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: MSK, month: 'numeric' }).format(now)) - 1;
}

/** «в сентябре» — подпись плитки выпуска за месяц. */
export function monthIn(now = new Date()): string {
  return `в ${MONTHS_IN[mskMonth(now)]}`;
}

/**
 * Сравнение с прошлым месяцем: «▲ 12 к августу», «▼ 3 к августу»,
 * «как в августе». Цифра без сравнения ничего не говорит, а сравнивать
 * с прошлым месяцем человек и так пытается в уме.
 */
export function monthDelta(
  current: number,
  previous: number,
  now = new Date(),
): { text: string; tone: 'up' | 'down' | 'flat' } {
  const prev = (mskMonth(now) + 11) % 12;
  const diff = current - previous;
  if (diff > 0) return { text: `▲ ${diff} к ${MONTHS_TO[prev]}`, tone: 'up' };
  if (diff < 0) return { text: `▼ ${-diff} к ${MONTHS_TO[prev]}`, tone: 'down' };
  return { text: `как в ${MONTHS_IN[prev]}`, tone: 'flat' };
}

/** Склонение по числу: 1 документ, 2 документа, 5 документов. */
export function plural(n: number, one: string, few: string, many: string): string {
  const mod100 = Math.abs(n) % 100;
  const mod10 = mod100 % 10;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}
