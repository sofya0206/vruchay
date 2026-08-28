/**
 * Распознавание таблицы во вставке из буфера обмена.
 *
 * Excel, Google Sheets и «Р7-Офис» при копировании диапазона кладут в буфер
 * тот же диапазон как TSV — колонки разделены табуляцией, строки переносом.
 * Поэтому вставку не нужно разбирать отдельным кодом: достаточно понять,
 * что в буфере таблица, и отправить текст в тот же разбор, что и файл.
 *
 * Ошибиться в другую сторону нельзя: если принять за таблицу обычный текст,
 * пропадёт привычная вставка в поле. Отсюда строгие признаки — одинаковое
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

/**
 * Разбор с оглядкой на кавычки.
 *
 * Ячейка с переносом строки внутри — обычное дело: так выглядит адрес
 * или примечание в две строки. Excel заключает такую ячейку в кавычки,
 * и наивное деление по переносу разрывало её на две строки разной ширины.
 * Вставка после этого вела себя как обычный текст, хотя сервер тот же
 * TSV разобрал бы верно.
 */
export function splitDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let cells: string[] = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (quoted) {
      // Удвоенная кавычка внутри значения — это одна кавычка, а не конец ячейки.
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
      continue;
    }

    // Кавычка открывает значение только в начале ячейки: в середине она сама по себе.
    if (ch === '"' && cell === '') quoted = true;
    else if (ch === delimiter) {
      cells.push(cell);
      cell = '';
    } else if (ch === '\n') {
      cells.push(cell);
      rows.push(cells);
      cells = [];
      cell = '';
    } else cell += ch;
  }

  cells.push(cell);
  rows.push(cells);
  return rows;
}

export function detectPastedTable(raw: string): PastedTable | null {
  const text = raw.replace(/\r\n?/g, '\n');
  if (text.trim() === '') return null;

  for (const delimiter of DELIMITERS) {
    const rows = splitDelimited(text, delimiter).filter((cells) =>
      cells.some((cell) => cell.trim() !== ''),
    );
    if (!rows.length) continue;

    const columns = rows[0].length;
    if (columns < 2) continue;
    // Одинаковая ширина всех строк — первое отличие таблицы от абзаца.
    if (!rows.every((cells) => cells.length === columns)) continue;

    // Табуляция в обычном тексте не встречается, поэтому одной строки
    // достаточно: скопировать из протокола одного участника — обычное дело.
    // Запятая и точка с запятой встречаются всюду, для них нужно хотя бы
    // две строки одинаковой ширины, иначе за таблицу сойдёт любая фраза.
    if (rows.length < 2 && delimiter !== '\t') continue;

    // В таблице после разделителя сразу идёт значение, а в предложении —
    // пробел: «Иванов, Пётр и Анна» это перечисление, а не две колонки.
    if (delimiter !== '\t' && rows.some((cells) => cells.some((cell) => /^\s/.test(cell)))) {
      continue;
    }

    return { text, rows: rows.length, columns, delimiter };
  }

  return null;
}

/**
 * Вставка пришла в поле ввода — значит, она принадлежит полю.
 *
 * Человек, который правит ячейку и вставляет туда кусок из Excel, ждёт
 * текст в ячейке, а не диалог импорта поверх страницы. Перехватывать такую
 * вставку — значит и текст потерять, и работу прервать.
 */
export function isEditableTarget(target: unknown): boolean {
  const element = target as { tagName?: unknown; isContentEditable?: unknown } | null;
  if (!element) return false;
  if (element.isContentEditable === true) return true;
  const tag = typeof element.tagName === 'string' ? element.tagName.toUpperCase() : '';
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

/** Событие вставки в том виде, в каком оно нужно для решения. */
export interface PasteLike {
  target: unknown;
  clipboardData: { getData(format: string): string } | null;
}

export type PastePlan =
  { kind: 'ignore' } | { kind: 'too-big' } | { kind: 'import'; file: File; table: PastedTable };

/**
 * Что делать со вставкой. Отдельно от обработчика, чтобы решение
 * проверялось тестами без браузера: цена ошибки здесь — молча съеденная
 * вставка в чужое поле.
 */
export function planPaste(event: PasteLike): PastePlan {
  if (isEditableTarget(event.target)) return { kind: 'ignore' };

  const text = event.clipboardData?.getData('text/plain') ?? '';
  const table = detectPastedTable(text);
  if (!table) return { kind: 'ignore' };

  // Имя файла условное: сервер по расширению выбирает разбор CSV,
  // а разделитель — табуляцию или точку с запятой — определяет сам.
  const file = new File([table.text], 'clipboard.tsv', { type: 'text/tab-separated-values' });
  if (file.size > MAX_PASTE_BYTES) return { kind: 'too-big' };

  return { kind: 'import', file, table };
}
