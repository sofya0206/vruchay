import type { DateFormat, UiDensity, UiTheme } from '../api/org';

/**
 * Тема и формат дат.
 *
 * Настройка живёт на сервере — человек садится за другой компьютер и
 * ждёт тот же кабинет. Но ждать ответа сервера, чтобы покрасить страницу,
 * нельзя: между отрисовкой и ответом кабинет мигнул бы светлым. Поэтому
 * выбранная тема дублируется в localStorage и применяется до запроса.
 */
const THEME_KEY = 'vruchay:theme';
const DENSITY_KEY = 'vruchay:density';

function isTheme(value: unknown): value is UiTheme {
  return value === 'system' || value === 'light' || value === 'dark';
}

export function applyTheme(theme: UiTheme): void {
  const root = document.documentElement;
  // Системную тему рисует сама CSS по prefers-color-scheme — атрибут
  // тогда надо убрать, иначе он навсегда перебьёт настройку системы.
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);

  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Приватный режим запрещает хранилище — тема просто не переживёт перезагрузку.
  }
}

/**
 * Плотность интерфейса. Поджатый вид меняет один корневой атрибут,
 * от которого пляшут отступы в списках и таблицах, — так настройка
 * не расползается по сотне компонентов.
 */
export function applyDensity(density: UiDensity): void {
  const root = document.documentElement;
  if (density === 'comfortable') root.removeAttribute('data-density');
  else root.setAttribute('data-density', density);

  try {
    localStorage.setItem(DENSITY_KEY, density);
  } catch {
    // Приватный режим — плотность не переживёт перезагрузку, и только.
  }
}

/** Тема из прошлого посещения; без хранилища — как в системе. */
export function readStoredTheme(): UiTheme {
  try {
    const stored: unknown = localStorage.getItem(THEME_KEY);
    return isTheme(stored) ? stored : 'system';
  } catch {
    return 'system';
  }
}

/** Тема и плотность из прошлого посещения — до того, как ответит сервер. */
export function applyStoredTheme(): void {
  applyTheme(readStoredTheme());
  try {
    if (localStorage.getItem(DENSITY_KEY) === 'compact') applyDensity('compact');
  } catch {
    // Нет хранилища — остаётся обычная плотность.
  }
}

const MONTHS = [
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

/**
 * Дата в выбранном человеком виде. Три формата: 03.09.2026 привычен,
 * «3 сентября 2026» читается в письме, 2026-09-03 нужен тем, кто
 * выгружает реестр в таблицу и сортирует строкой.
 */
export function formatDate(value: string | Date, format: DateFormat = 'numeric'): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const day = date.getDate();
  const month = date.getMonth();
  const year = date.getFullYear();
  const pad = (n: number) => String(n).padStart(2, '0');

  if (format === 'long') return `${day} ${MONTHS[month]} ${year}`;
  if (format === 'iso') return `${year}-${pad(month + 1)}-${pad(day)}`;
  return `${pad(day)}.${pad(month + 1)}.${year}`;
}

/** Дата со временем — для журналов, где важен порядок событий внутри дня. */
export function formatDateTime(value: string | Date, format: DateFormat = 'numeric'): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const time = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  return `${formatDate(date, format)}, ${time}`;
}
