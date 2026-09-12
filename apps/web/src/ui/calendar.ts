/**
 * Арифметика календаря. Без разметки — её и проверяем тестами.
 *
 * Дата везде ходит строкой «ГГГГ-ММ-ДД» — тем же видом, что отдавало
 * нативное поле. Объекты Date наружу не выпускаем: часовой пояс превратил
 * бы «1 сентября» в «31 августа 21:00» на первом же сохранении.
 */

export const MONTHS = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
];

/** Неделя начинается с понедельника: так пишут отрывные календари. */
export const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

export interface Day {
  iso: string;
  day: number;
  /** Из соседнего месяца — показываем приглушённо, чтобы сетка не рвалась. */
  outside: boolean;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function toIso(year: number, month: number, day: number): string {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

/**
 * Разбирает «ГГГГ-ММ-ДД». Возвращает null на пустом и на несуществующем:
 * «2026-02-30» перевести некуда, а молчаливый перенос на 2 марта человек
 * заметил бы уже в напечатанном документе.
 */
export function fromIso(iso: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  if (month < 0 || month > 11 || day < 1) return null;
  if (day > daysIn(year, month)) return null;

  return { year, month, day };
}

export function daysIn(year: number, month: number): number {
  // Нулевой день следующего месяца — последний день текущего, включая февраль
  // високосного года: правило «раз в четыре, но не раз в сто» уже внутри Date.
  return new Date(year, month + 1, 0).getDate();
}

export function shiftMonth(year: number, month: number, delta: number) {
  const total = year * 12 + month + delta;
  return { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 };
}

/**
 * Сетка месяца: шесть недель по семь дней, с хвостами соседних месяцев.
 *
 * Ровно шесть строк всегда, а не «сколько получится»: иначе при переходе
 * между месяцами поповер прыгал бы в высоте под курсором.
 */
export function monthGrid(year: number, month: number): Day[][] {
  const first = new Date(year, month, 1).getDay();
  // getDay() считает от воскресенья, а мы — от понедельника.
  const lead = (first + 6) % 7;

  const days: Day[] = [];
  const prev = shiftMonth(year, month, -1);
  const prevLength = daysIn(prev.year, prev.month);
  for (let i = lead - 1; i >= 0; i--) {
    const day = prevLength - i;
    days.push({ iso: toIso(prev.year, prev.month, day), day, outside: true });
  }

  const length = daysIn(year, month);
  for (let day = 1; day <= length; day++) {
    days.push({ iso: toIso(year, month, day), day, outside: false });
  }

  const next = shiftMonth(year, month, 1);
  for (let day = 1; days.length < 42; day++) {
    days.push({ iso: toIso(next.year, next.month, day), day, outside: true });
  }

  return Array.from({ length: 6 }, (_, week) => days.slice(week * 7, week * 7 + 7));
}

/** Сегодняшний день в том же виде — для подсветки в сетке. */
export function todayIso(): string {
  const now = new Date();
  return toIso(now.getFullYear(), now.getMonth(), now.getDate());
}

/** «2026-09-12» → «12 сентября 2026». Для подписи кнопки. */
const GENITIVE = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
];

export function humanIso(iso: string): string | null {
  const parsed = fromIso(iso);
  return parsed ? `${parsed.day} ${GENITIVE[parsed.month]} ${parsed.year}` : null;
}
