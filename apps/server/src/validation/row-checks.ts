import { declineFullName } from '@gramota/shared';
import { isValidEmail } from '../mail/mail-template';

/**
 * Проверки значений в строках списка получателей.
 *
 * Всё здесь — чистые функции над строками таблицы: ни базы, ни макета,
 * ни сессии. Так их можно проверить тестами по одной, а главное — прогнать
 * десять тысяч строк, ни разу никуда не сходив.
 */

/**
 * Приведение ФИО к виду, в котором тёзки совпадают, а опечатки — нет.
 *
 * «ё» сводим к «е»: в списках участников одного и того же человека пишут
 * и «Пётр», и «Петр», и это один человек, а не двое. Регистр убираем
 * по той же причине — половина протоколов выгружается прописными.
 */
export function normalizeName(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/ё/gi, 'е')
    .toLocaleLowerCase('ru-RU');
}

/** Адреса сравниваем без регистра: почтовые серверы его не различают. */
export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

const CYRILLIC = /[Ѐ-ӿԀ-ԯ]/;
const LATIN = /[A-Za-z]/;

/** Кириллические буквы в строке, каждая по разу. */
export function cyrillicInEmail(value: string): string[] {
  const found = new Set<string>();
  for (const char of value) if (CYRILLIC.test(char)) found.add(char);
  return [...found];
}

/**
 * Кириллица там, где ожидается латиница.
 *
 * Самая коварная ошибка во всём списке: «ivanоv@mail.ru» с русской «о»
 * выглядит совершенно правильным адресом и проходит любую проверку формата.
 * Письмо уходит в никуда, человек остаётся без грамоты, а организатор
 * ищет причину в чём угодно, кроме одной буквы.
 *
 * Придираемся именно к смеси, а не к кириллице вообще. Адрес целиком
 * на кириллице — «иван@почта.рф» — это настоящий домен, редкий, но
 * законный, и объявлять его ошибкой мы не вправе. А вот латиница
 * и кириллица в одном адресе объяснимы ровно одним: набирали
 * в русской раскладке и не заметили.
 *
 * Возвращает сами подменные буквы — иначе человеку нечего искать
 * в строке, которая на вид безупречна.
 */
export function mixedScriptInEmail(value: string): string[] {
  if (!CYRILLIC.test(value) || !LATIN.test(value)) return [];
  return cyrillicInEmail(value);
}

export function looksLikeEmail(value: string): boolean {
  return isValidEmail(value);
}

/** Прописные буквы во всём ФИО: «ИВАНОВ ПЁТР ИЛЬИЧ». */
export function isAllUppercase(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length < 2) return false;

  // Считаем только буквы, у которых вообще есть регистр: цифры и знаки
  // одинаковы в обоих, и по ним ничего не понять.
  const cased = [...trimmed].filter((c) => c.toLocaleLowerCase('ru-RU') !== c.toLocaleUpperCase('ru-RU'));
  if (cased.length < 2) return false;

  return cased.every((c) => c === c.toLocaleUpperCase('ru-RU'));
}

/**
 * «ИВАНОВ ПЁТР» → «Иванов Пётр».
 *
 * Части через дефис поднимаем обе: «Римский-Корсаков», а не «Римский-корсаков».
 */
export function toTitleCase(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('ru-RU')
    .replace(/(^|[\s\-–—'’(])([\p{L}])/gu, (_all, before: string, letter: string) =>
      before + letter.toLocaleUpperCase('ru-RU'),
    );
}

const MONTHS = [
  'январ', 'феврал', 'март', 'апрел', 'ма', 'июн',
  'июл', 'август', 'сентябр', 'октябр', 'ноябр', 'декабр',
];

/**
 * Разбор даты в том виде, в каком её пишут в таблицах.
 *
 * Excel отдаёт «17.06.2026», выгрузки из систем — «2026-06-17», а руками
 * пишут «17 июня 2026 г.». Всё это одна и та же дата, и придираться
 * к формату мы не вправе: печатается всё равно то, что в ячейке.
 * Наше дело — заметить «31.02.2026» и «17.13.2026», то есть даты,
 * которых не существует.
 *
 * Возвращает null, если разобрать не удалось.
 */
export function parseLooseDate(value: string): Date | null {
  const source = value.trim();
  if (!source) return null;

  let day: number | undefined;
  let month: number | undefined;
  let year: number | undefined;

  const numeric = source.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2}|\d{4})$/);
  const iso = source.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const verbal = source.match(/^(\d{1,2})\s+([а-яё]+)\.?\s+(\d{4})(\s*(г\.?|года?))?$/i);

  if (numeric) {
    day = Number(numeric[1]);
    month = Number(numeric[2]);
    year = Number(numeric[3]);
    // Двузначный год: «26» это 2026, а «98» — 1998. Границу проводим
    // по полувеку вперёд, как это делает сам Excel.
    if (numeric[3].length === 2) year += year <= 69 ? 2000 : 1900;
  } else if (iso) {
    year = Number(iso[1]);
    month = Number(iso[2]);
    day = Number(iso[3]);
  } else if (verbal) {
    day = Number(verbal[1]);
    const name = verbal[2].toLowerCase().replace(/ё/g, 'е');
    const index = MONTHS.findIndex((stem) => name.startsWith(stem));
    if (index < 0) return null;
    // «ма» совпадает и с «мая», и с «марта» — но «март» проверяется раньше,
    // поэтому до «ма» доходит только май.
    month = index + 1;
    year = Number(verbal[3]);
  } else {
    return null;
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (year < 1900 || year > 2200) return null;

  const date = new Date(Date.UTC(year, month - 1, day));
  // 31 февраля Date молча превращает во 2 марта — ловим именно это.
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;

  return date;
}

/**
 * Похожа ли колонка на дату по названию.
 *
 * Имена колонок латинские и приходят из подбора при импорте
 * (apps/server/src/import/column-names.ts), где «Дата» превращается в «date».
 */
export function looksLikeDateColumn(name: string): boolean {
  return /^(date|birth|dob|birthday|birthdate)(_\d+)?$/i.test(name);
}

/**
 * Доля значений колонки, которые разбираются как дата.
 *
 * Нужна, чтобы не завалить человека предупреждениями. Колонку «date»
 * заводят и под свободный текст вроде «весенняя сессия»; если дат в ней
 * почти нет — это текстовая колонка, и придираться не к чему. А вот
 * одна ячейка «31.02.2026» среди трёхсот нормальных дат — это опечатка,
 * и о ней сказать надо.
 */
export const DATE_COLUMN_THRESHOLD = 0.6;

export function isDateColumn(values: string[]): boolean {
  const filled = values.filter((v) => v.trim() !== '');
  if (filled.length < 3) return false;
  const parsed = filled.filter((v) => parseLooseDate(v) !== null).length;
  return parsed / filled.length >= DATE_COLUMN_THRESHOLD;
}

/**
 * Удалось ли склонить имя в дательный падеж.
 *
 * Спрашиваем только когда в макете есть «%name_dat»: если падеж нигде
 * не печатается, неудача склонения никого не касается.
 *
 * Признак неудачи — имя вернулось нетронутым. Так declineFullName сообщает,
 * что сдалась: латиница, четыре слова, неизвестный пол. Это её же правило
 * «в сомнении не склоняем», и здесь мы просто передаём сомнение человеку.
 */
export function declensionFailed(name: string): boolean {
  const source = name.trim().replace(/\s+/g, ' ');
  if (!source) return false;
  return declineFullName(source, 'dative') === source;
}

/** Группы одинаковых значений: ключ → номера строк, где он встретился. */
export function groupDuplicates<T>(
  items: T[],
  keyOf: (item: T) => string | null,
): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    if (!key) continue;
    const bucket = groups.get(key);
    if (bucket) bucket.push(item);
    else groups.set(key, [item]);
  }
  for (const [key, bucket] of groups) if (bucket.length < 2) groups.delete(key);
  return groups;
}
