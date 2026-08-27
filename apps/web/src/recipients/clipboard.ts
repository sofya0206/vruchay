/**
 * Распознавание таблицы во вставке из буфера обмена.
 *
 * Excel, Google Sheets и «Р7-Офис» при копировании диапазона кладут в буфер
 * тот же диапазон как TSV — колонки разделены табуляцией, строки переносом.
 * Поэтому вставку не нужно разбирать отдельным кодом: достаточно понять,
 * что в буфере таблица, и отправить текст в тот же разбор, что и файл.
 *
 * Ошибиться в другую сторону нельзя: если принять за таблицу обычный текст,
 * пропадёт привычная вставка в ячейку. Отсюда строгие признаки — одинаковое
 * число колонок в каждой строке и не меньше двух колонок.
 */

/** Столько же, сколько принимает загрузка файла (MAX_TABLE_BYTES на сервере). */
export const MAX_PASTE_BYTES = 10 * 1024 * 1024;

export interface PastedTable {
  /** Текст для разбора — ровно то, что лежало в буфере. */
  text: string;
  rows: number;
  columns: number;
  delimiter: '\t' | ';' | ',';
}

const DELIMITERS = ['\t', ';', ','] as const;

export function detectPastedTable(raw: string): PastedTable | null {
  const text = raw.replace(/\r\n?/g, '\n');
  const lines = text.split('\n').filter((line) => line.trim() !== '');
  if (lines.length < 2) return null;

  for (const delimiter of DELIMITERS) {
    const split = lines.map((line) => line.split(delimiter));
    const columns = split[0].length;
    if (columns < 2) continue;
    // Одинаковая ширина всех строк — первое отличие таблицы от абзаца.
    if (!split.every((cells) => cells.length === columns)) continue;
    // Табуляция в обычном тексте не встречается, а запятая встречается всюду.
    // В таблице после разделителя сразу идёт значение, а в предложении —
    // пробел: «Иванов, Пётр и Анна» это перечисление, а не две колонки.
    if (delimiter !== '\t' && split.some((cells) => cells.some((cell) => /^\s/.test(cell)))) {
      continue;
    }
    return { text, rows: lines.length, columns, delimiter };
  }

  return null;
}
