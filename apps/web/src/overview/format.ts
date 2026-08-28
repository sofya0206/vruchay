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
  tone: 'neutral' | 'progress' | 'done';
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
      return { label: 'не удалось', tone: 'neutral' };
    case 'canceled':
      return { label: 'отменено', tone: 'neutral' };
  }
}

/**
 * Название материала, который заводится под протокол одним нажатием.
 *
 * С датой, потому что соревнований за сезон десятки и на один бланк:
 * без даты в списке материалов оказалось бы пять «Соревнований» подряд,
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
  return `Соревнование от ${date}`;
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
