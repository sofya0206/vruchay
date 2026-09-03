/**
 * Приведение значений из чужой таблицы к пригодному для печати виду.
 *
 * Списки заполняют руками и в разных местах, поэтому в ячейках оказывается
 * то, чего в сертификате быть не должно:
 *  — двойные пробелы, неразрывный пробел из Word, перенос строки внутри ячейки;
 *  — невидимые символы (BOM, U+200B) — их не видит ни отправитель, ни мы,
 *    но они ломают сравнение и переносы;
 *  — «ИВАНОВ ИВАН» капслоком: так печатают протоколы, а в грамоте это крик;
 *  — почта с кириллическими буквами внутри латинского адреса — обычная
 *    опечатка при ручном вводе, письмо по такому адресу не уходит.
 *
 * Безопасные правки (пробелы, регистр почты) применяются сразу.
 * Всё, что меняет сам текст имени, только предлагается: как пишется фамилия
 * участника, решает пользователь, а не мы.
 */

import { suggestColumnName } from './column-names';

/** Что предлагается исправить — пользователь подтверждает это явно. */
export interface ImportSuggestion {
  kind: 'uppercase' | 'email-homoglyph';
  /** Индекс колонки в `columns` разобранного листа. */
  column: number;
  /** Заголовок колонки — чтобы предложение читалось без сверки с таблицей. */
  columnTitle: string;
  /** Сколько ячеек колонки изменится. */
  count: number;
  /** Пример «было → стало» из первой затронутой ячейки. */
  before: string;
  after: string;
  /** Готовые значения колонки по строкам: применение — присваивание. */
  values: string[];
}

// Мягкий перенос и символы нулевой ширины: в \s их нет, а в тексте им не место.
const ZERO_WIDTH = /[\u00ad\u200b-\u200f]/g;
// Схлопываем любые пробельные: \s в JavaScript включает и неразрывный пробел из Word.
const SPACES = /\s+/g;

/**
 * Управляющие символы. Проверяем по коду, а не регулярным выражением:
 * управляющие символы внутри регулярного выражения запрещены линтером.
 */
function stripControl(value: string): string {
  return [...value]
    .filter((ch) => {
      const code = ch.charCodeAt(0);
      // Табуляцию и переносы оставляем — ниже они схлопнутся в обычный пробел.
      if (code === 9 || code === 10 || code === 13) return true;
      return code > 31 && code !== 127;
    })
    .join('');
}

/** Обрезка краёв и схлопывание пробелов; перенос строки внутри ячейки тоже пробел. */
export function cleanCell(value: string): string {
  return stripControl(value).replace(ZERO_WIDTH, '').replace(SPACES, ' ').trim();
}

/**
 * Похоже на адрес почты. Проверка нарочно грубая: строгую валидацию делает
 * рассылка, здесь нужно лишь понять, к какой ячейке применять правила почты.
 */
export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/** Регистр в адресе роли не играет, а «Ivanov@Mail.ru» в списке мешает искать дубли. */
export function normalizeEmail(value: string): string {
  return value.toLowerCase();
}

/**
 * Кириллические двойники латинских букв. Возникают, когда адрес набирают,
 * забыв переключить раскладку: на вид «ivanov@mail.ru», а буква «о» русская.
 */
const HOMOGLYPHS: Record<string, string> = {
  а: 'a', в: 'b', е: 'e', ё: 'e', к: 'k', м: 'm', н: 'h', о: 'o', р: 'p',
  с: 'c', т: 't', у: 'y', х: 'x', і: 'i', ј: 'j', ѕ: 's', ԁ: 'd', ԛ: 'q', ԝ: 'w',
};

const CYRILLIC = /[Ѐ-ӿԀ-ԯ]/;

/** Адрес набран в двух алфавитах сразу — почти наверняка опечатка. */
export function hasMixedAlphabets(value: string): boolean {
  return CYRILLIC.test(value) && /[a-z]/i.test(value);
}

/**
 * Замена кириллических двойников на латиницу. Возвращает null, если после
 * замены кириллица осталась: значит, это не опечатка раскладки, и угадывать
 * за пользователя нельзя — такой адрес уходит в предупреждение.
 */
export function fixHomoglyphs(value: string): string | null {
  const fixed = value.replace(/[Ѐ-ӿԀ-ԯ]/g, (ch) => HOMOGLYPHS[ch] ?? ch);
  return CYRILLIC.test(fixed) ? null : fixed;
}

function isUpper(ch: string): boolean {
  return ch !== ch.toLocaleLowerCase('ru') && ch === ch.toLocaleUpperCase('ru');
}

function isLower(ch: string): boolean {
  return ch !== ch.toLocaleUpperCase('ru') && ch === ch.toLocaleLowerCase('ru');
}

/**
 * Строка написана капслоком.
 *
 * Коротких слов не касаемся: «МС», «КМС», «СССР» — это аббревиатуры,
 * а не крик, и «Кмс» вместо них было бы хуже оригинала.
 */
export function isShouting(value: string): boolean {
  const letters = [...value].filter((ch) => isUpper(ch) || isLower(ch));
  if (letters.length < 4) return false;
  if (letters.some(isLower)) return false;
  return value.includes(' ') || letters.length >= 6;
}

/**
 * «ИВАНОВ ИВАН» → «Иванов Иван»; дефис и апостроф считаются границей слова.
 *
 * `keepAbbreviations` бережёт короткие слова целиком из заглавных: в графе
 * «Организация» стоит «ИМ СО РАН», «МБУ ДО СШОР», «ГБОУ» — приведение
 * превращало их в «Им Со Ран», то есть портило данные вместо чистки.
 * В графе с ФИО его выключаем: там аббревиатур не бывает, а имя из четырёх
 * букв («ИВАН», «АННА») — сплошь и рядом.
 */
export function toTitleCase(value: string, keepAbbreviations = false): string {
  return value.replace(/\p{L}+/gu, (word) => {
    if (keepAbbreviations && isAbbreviation(word)) return word;
    const [first, ...rest] = [...word];
    return first.toLocaleUpperCase('ru') + rest.join('').toLocaleLowerCase('ru');
  });
}

/** Короткое слово целиком из заглавных: СО, РАН, СШОР, ГБОУ. */
function isAbbreviation(word: string): boolean {
  const letters = [...word];
  return letters.length <= 4 && letters.every(isUpper);
}

/**
 * Графа с именем человека — по заголовку, тем же разбором, что и импорт.
 * От неё зависит, беречь ли аббревиатуры при чистке капслока.
 */
function isNameColumn(columnTitle: string): boolean {
  const suggested = suggestColumnName(columnTitle);
  return suggested === 'name' || suggested === 'surname' || suggested === 'firstname' || suggested === 'patronymic';
}

/**
 * Потолок предложений. Каждое несёт готовые значения целой колонки,
 * поэтому в протоколе, набранном капслоком целиком, ответ разбора вырос бы
 * кратно числу колонок. Десяти хватает: остальное правится в самой таблице.
 */
const MAX_SUGGESTIONS = 10;

export interface SanitizeResult {
  rows: string[][];
  suggestions: ImportSuggestion[];
  warnings: string[];
}

/**
 * Чистка всей таблицы разом.
 *
 * Строки приходят уже вырезанными по колонкам, поэтому индекс колонки
 * в предложении совпадает с индексом в `columns` разобранного листа.
 */
export function sanitizeRows(rows: string[][], columnTitles: string[]): SanitizeResult {
  const warnings: string[] = [];
  let spaceFixes = 0;
  let emailCaseFixes = 0;

  const cleaned = rows.map((row) =>
    row.map((cell) => {
      let value = cleanCell(cell);
      if (value !== cell.trim()) spaceFixes++;
      if (looksLikeEmail(value)) {
        const lower = normalizeEmail(value);
        if (lower !== value) emailCaseFixes++;
        value = lower;
      }
      return value;
    }),
  );

  if (spaceFixes > 0) {
    // Число ставим после двоеточия: «1 ячеек» иначе не согласуется.
    warnings.push(`Лишние пробелы и невидимые символы убраны в ячейках: ${spaceFixes}`);
  }
  if (emailCaseFixes > 0) {
    warnings.push(`Адреса почты приведены к строчным буквам: ${emailCaseFixes}`);
  }

  const suggestions: ImportSuggestion[] = [];

  for (let col = 0; col < columnTitles.length; col++) {
    const columnTitle = columnTitles[col] ?? '';
    if (suggestions.length >= MAX_SUGGESTIONS) {
      warnings.push(
        `Предложений по чистке больше ${MAX_SUGGESTIONS} — показаны первые, остальное поправьте в таблице`,
      );
      break;
    }

    const keepAbbreviations = !isNameColumn(columnTitle);
    const shouting = collect(cleaned, col, (value) =>
      isShouting(value) ? toTitleCase(value, keepAbbreviations) : null,
    );
    if (shouting) suggestions.push({ kind: 'uppercase', column: col, columnTitle, ...shouting });

    let unfixable = 0;
    const homoglyphs = collect(cleaned, col, (value) => {
      if (!looksLikeEmail(value) || !hasMixedAlphabets(value)) return null;
      const fixed = fixHomoglyphs(value);
      if (fixed === null) unfixable++;
      return fixed;
    });
    if (homoglyphs) {
      suggestions.push({ kind: 'email-homoglyph', column: col, columnTitle, ...homoglyphs });
    }
    if (unfixable > 0) {
      warnings.push(
        `В колонке «${columnTitle}» адресов с кириллицей: ${unfixable} — исправьте вручную, письмо по такому адресу не уйдёт`,
      );
    }
  }

  return { rows: cleaned, suggestions, warnings };
}

/** Значения колонки после правки — вместе со счётчиком и примером. */
function collect(
  rows: string[][],
  col: number,
  fix: (value: string) => string | null,
): { count: number; before: string; after: string; values: string[] } | null {
  const values: string[] = [];
  let count = 0;
  let before = '';
  let after = '';

  for (const row of rows) {
    const value = row[col] ?? '';
    const fixed = value === '' ? null : fix(value);
    if (fixed === null || fixed === value) {
      values.push(value);
      continue;
    }
    if (count === 0) {
      before = value;
      after = fixed;
    }
    count++;
    values.push(fixed);
  }

  return count > 0 ? { count, before, after, values } : null;
}
