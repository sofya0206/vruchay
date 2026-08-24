import ExcelJS from 'exceljs';
import Papa from 'papaparse';
import iconv from 'iconv-lite';
import { suggestColumnName } from './column-names';

/**
 * Разбор файлов со списками участников.
 *
 * Реальные файлы от федераций почти никогда не выглядят как аккуратная таблица:
 *  — сверху идёт название соревнования и дата, шапка оказывается в 3–5 строке;
 *  — заголовки объединены по нескольким ячейкам, и значение лежит только
 *    в левой верхней, остальные пустые;
 *  — встречаются пустые строки-разделители между группами;
 *  — в CSV из Excel кодировка Windows-1251, а не UTF-8;
 *  — часть ячеек — формулы без сохранённого значения, они читаются как пустые.
 * Всё это учитывается ниже, иначе импорт превращается в ручную работу.
 */

export interface ParsedSheet {
  /** Имя листа книги; для CSV пусто. */
  sheetName: string;
  /** Номер строки с шапкой, от нуля, в координатах исходного файла. */
  headerRowIndex: number;
  columns: { source: string; suggested: string }[];
  rows: string[][];
  /** Сколько строк отброшено как полностью пустые. */
  skippedEmptyRows: number;
  /** Предупреждения для пользователя. */
  warnings: string[];
}

const MAX_ROWS = 5000;
const MAX_COLUMNS = 30;
const HEADER_SEARCH_DEPTH = 15;
const MAX_SHEETS = 20;

export function isCsv(filename: string): boolean {
  return /\.(csv|txt|tsv)$/i.test(filename);
}

/** CSV из Excel часто приходит в Windows-1251 — без распознавания получим «кракозябры». */
export function decodeCsv(buffer: Buffer): string {
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return buffer.subarray(3).toString('utf8');
  }
  const asUtf8 = buffer.toString('utf8');
  // U+FFFD появляется там, где байты не складываются в корректный UTF-8.
  if (!asUtf8.includes('�')) return asUtf8;
  return iconv.decode(buffer, 'win1251');
}

export function parseCsv(buffer: Buffer): string[][] {
  const text = decodeCsv(buffer);
  const result = Papa.parse<string[]>(text, {
    skipEmptyLines: false,
    // Разделитель определяется автоматически: встречаются и запятая, и точка с запятой.
    delimiter: '',
  });
  return result.data.map((row) => row.map((cell) => String(cell ?? '').trim()));
}

/**
 * Из книги берём один лист — тот, на котором действительно список.
 * Первым листом часто идёт обложка, инструкция или итоговая справка;
 * если брать его вслепую, импорт падает с «не удалось определить шапку»,
 * хотя нужная таблица лежит на соседнем листе.
 */
export async function parseWorkbook(
  buffer: Buffer,
): Promise<{ name: string; grid: string[][]; notes: string[] }> {
  const workbook = new ExcelJS.Workbook();
  // ExcelJS типизирован под собственный Buffer из своих зависимостей;
  // на рантайме это обычный Node.js Buffer.
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);

  const visible = workbook.worksheets.filter((ws) => ws.state !== 'hidden');
  const sheets = (visible.length ? visible : workbook.worksheets).slice(0, MAX_SHEETS);
  if (!sheets.length) throw new Error('В файле нет ни одного листа');

  const read = sheets.map((sheet) => readSheet(sheet));
  const withTable = read.filter((s) => looksLikeTable(s.grid));
  const chosen = withTable[0] ?? read[0];

  const notes: string[] = [];
  if (chosen !== read[0]) {
    notes.push(`Список найден на листе «${chosen.name}», предыдущие листы книги пропущены`);
  }
  const others = withTable.filter((s) => s !== chosen).map((s) => `«${s.name}»`);
  if (others.length) {
    notes.push(
      `В книге есть ещё листы со списками: ${others.join(', ')}. ` +
        `Загружен только «${chosen.name}» — остальные загрузите отдельно`,
    );
  }
  if (chosen.errorCells > 0) {
    notes.push(
      `Ячеек с ошибками формул (#Н/Д, #ДЕЛ/0! и подобные): ${chosen.errorCells} — они прочитаны как пустые`,
    );
  }
  return { name: chosen.name, grid: chosen.grid, notes };
}

function readSheet(sheet: ExcelJS.Worksheet): {
  name: string;
  grid: string[][];
  errorCells: number;
} {
  const grid: string[][] = [];
  let errorCells = 0;
  const width = Math.min(sheet.columnCount || 0, MAX_COLUMNS);
  sheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    const values: string[] = [];
    for (let col = 1; col <= width; col++) {
      const cell = row.getCell(col);
      if (isErrorValue(cell.value)) errorCells++;
      values.push(cellText(cell));
    }
    grid[rowNumber - 1] = values;
  });

  fillMergedCells(sheet, grid);
  return { name: sheet.name, grid: grid.map((r) => r ?? []), errorCells };
}

/** Лист похож на список: нашлась строка-шапка и под ней есть хоть что-то. */
function looksLikeTable(grid: string[][]): boolean {
  const header = detectHeaderRow(grid);
  const labels = (grid[header] ?? []).filter((c) => c.trim() !== '' && !looksLikeData(c)).length;
  if (labels < 2) return false;
  return grid.slice(header + 1).some((row) => row.some((c) => c.trim() !== ''));
}

/**
 * У объединённых ячеек значение хранится только в левой верхней.
 * Растягиваем его на всю область, иначе шапка «Результат» над двумя колонками
 * даст один заголовок и одну пустую колонку.
 */
function fillMergedCells(sheet: ExcelJS.Worksheet, grid: string[][]): void {
  const merges: string[] = (sheet.model as { merges?: string[] }).merges ?? [];
  for (const range of merges) {
    const [from, to] = range.split(':');
    const start = decodeAddress(from);
    const end = decodeAddress(to ?? from);
    if (!start || !end) continue;
    const value = grid[start.row]?.[start.col] ?? '';
    if (!value) continue;
    for (let r = start.row; r <= end.row; r++) {
      for (let c = start.col; c <= end.col; c++) {
        if (grid[r] && !grid[r][c]) grid[r][c] = value;
      }
    }
  }
}

function decodeAddress(address: string): { row: number; col: number } | null {
  const match = /^([A-Z]+)(\d+)$/i.exec(address.replace(/\$/g, ''));
  if (!match) return null;
  let col = 0;
  for (const ch of match[1].toUpperCase()) col = col * 26 + (ch.charCodeAt(0) - 64);
  return { row: Number(match[2]) - 1, col: col - 1 };
}

function cellText(cell: ExcelJS.Cell): string {
  return valueText(cell.value);
}

/**
 * Значение ячейки текстом. Результат формулы разбирается тем же кодом:
 * внутри может оказаться дата, размеченный текст или ошибка вычисления.
 */
function valueText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return formatDate(value);
  if (typeof value === 'object') {
    const object = value as Record<string, unknown>;
    // Ошибка вычисления (#Н/Д, #ДЕЛ/0!): значения нет. Раньше такая ячейка
    // приводилась к строке и в диплом уезжало «[object Object]».
    if ('error' in object) return '';
    // Формула: берём сохранённый результат. Если его нет — ячейка пустая,
    // и это отдельно попадает в предупреждения.
    if ('result' in object) return valueText(object.result);
    if ('richText' in object) {
      return (object.richText as { text: string }[])
        .map((part) => part.text)
        .join('')
        .trim();
    }
    if ('text' in object) return valueText(object.text);
    return '';
  }
  return String(value).trim();
}

function isErrorValue(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const object = value as Record<string, unknown>;
  if ('error' in object) return true;
  return 'result' in object && isErrorValue(object.result);
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Ячейка похожа на данные, а не на заголовок колонки. */
function looksLikeData(cell: string): boolean {
  const value = cell.trim();
  if (value === '') return false;
  if (value.includes('@')) return true;
  if (/^[\d\s.,:/-]+$/.test(value)) return true;
  return value.length > 40;
}

/**
 * Шапку ищем по «похожести на заголовки», а не по числу заполненных ячеек:
 * строка данных запросто бывает плотнее шапки, если в шапке есть пропуски.
 * Заголовок — это короткий текст без почты и без чистых чисел.
 */
export function detectHeaderRow(grid: string[][]): number {
  const limit = Math.min(grid.length, HEADER_SEARCH_DEPTH);
  let best = { index: 0, score: -Infinity };

  for (let i = 0; i < limit; i++) {
    const row = grid[i] ?? [];
    let labels = 0;
    let data = 0;
    for (const cell of row) {
      if (cell.trim() === '') continue;
      if (looksLikeData(cell)) data++;
      else labels++;
    }
    if (labels < 2) continue;

    const score = labels - data;
    // При равенстве берём более раннюю строку: над таблицей обычно шапка файла.
    if (score > best.score) best = { index: i, score };
  }

  return best.score === -Infinity ? 0 : best.index;
}

/** Перенос строки внутри заголовка — обычное дело; в имени колонки он лишний. */
function normalizeHeader(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function lastNonEmptyRow(grid: string[][], from: number): number {
  let last = from - 1;
  for (let i = from; i < grid.length; i++) {
    if ((grid[i] ?? []).some((cell) => cell.trim() !== '')) last = i;
  }
  return last;
}

/**
 * Двухэтажная шапка: «Контакты» объединено над «почта» и «телефон».
 * Вторую строку берём в заголовок, только если она дополняет первую —
 * иначе в шапку уедет первый участник. Признаки: слева стоит та же
 * объединённая подпись (или пусто), ниже нет ничего похожего на данные,
 * а сверху есть повторы от объединения или пропуски.
 */
function readHeader(grid: string[][], index: number): { header: string[]; rowsUsed: number } {
  const first = (grid[index] ?? []).map((cell) => cell.trim());
  const second = (grid[index + 1] ?? []).map((cell) => cell.trim());
  const filled = second.filter((cell) => cell !== '');

  const leftColumnFree = (second[0] ?? '') === '' || (second[0] ?? '') === (first[0] ?? '');
  const topHasGapsOrMerges = first.some(
    (cell, i) => (cell === '' && second[i]) || (cell !== '' && cell === first[i - 1]),
  );
  const complements =
    filled.length >= 2 &&
    filled.every((cell) => !looksLikeData(cell)) &&
    leftColumnFree &&
    topHasGapsOrMerges;

  if (!complements) return { header: first, rowsUsed: 1 };

  const width = Math.max(first.length, second.length);
  const header = Array.from({ length: width }, (_, i) => {
    const top = first[i] ?? '';
    const bottom = second[i] ?? '';
    if (!bottom || top === bottom) return top;
    return top ? `${top} ${bottom}` : bottom;
  });
  return { header, rowsUsed: 2 };
}

export function buildSheet(name: string, grid: string[][]): ParsedSheet {
  const warnings: string[] = [];
  const headerRowIndex = detectHeaderRow(grid);
  const { header: headerRow, rowsUsed } = readHeader(grid, headerRowIndex);
  const firstDataRow = headerRowIndex + rowsUsed;
  // Хвост пустых строк тянется до последней когда-либо тронутой ячейки —
  // в файле из Excel это сотни строк, и считать их «пропущенными» незачем.
  const lastDataRow = lastNonEmptyRow(grid, firstDataRow);

  // Пустые колонки справа и посередине отбрасываем вместе с их данными.
  const keptColumns = headerRow
    .map((value, index) => ({ value: normalizeHeader(value), index }))
    .filter((c) => c.value !== '')
    .slice(0, MAX_COLUMNS);

  if (!keptColumns.length) throw new Error('Не удалось определить шапку таблицы');

  const taken = new Set<string>();
  const columns = keptColumns.map((c) => {
    const suggested = suggestColumnName(c.value, taken);
    taken.add(suggested);
    return { source: c.value, suggested };
  });

  let skippedEmptyRows = 0;
  const rows: string[][] = [];
  for (let i = firstDataRow; i <= lastDataRow && rows.length < MAX_ROWS; i++) {
    const source = grid[i] ?? [];
    const values = keptColumns.map((c) => (source[c.index] ?? '').trim());
    if (values.every((v) => v === '')) {
      skippedEmptyRows++;
      continue;
    }
    rows.push(values);
  }

  if (headerRowIndex > 0) {
    warnings.push(
      `Шапка найдена в строке ${headerRowIndex + 1}; строки выше пропущены как заголовок файла`,
    );
  }
  if (rowsUsed === 2) {
    warnings.push('Шапка занимает две строки — заголовки склеены через пробел');
  }
  if (skippedEmptyRows > 0) {
    warnings.push(`Пропущено пустых строк: ${skippedEmptyRows}`);
  }
  if (lastDataRow - firstDataRow + 1 > MAX_ROWS) {
    warnings.push(`Взяты первые ${MAX_ROWS} строк — остальные не поместились`);
  }
  const emptyCells = rows.flat().filter((v) => v === '').length;
  if (rows.length && emptyCells / (rows.length * columns.length) > 0.3) {
    warnings.push(
      'Больше трети ячеек пустые. Если в файле есть формулы, откройте его в Excel и сохраните заново',
    );
  }

  return { sheetName: name, headerRowIndex, columns, rows, skippedEmptyRows, warnings };
}

export async function parseSpreadsheet(buffer: Buffer, filename: string): Promise<ParsedSheet> {
  if (isCsv(filename)) return buildSheet('', parseCsv(buffer));
  const { name, grid, notes } = await parseWorkbook(buffer);
  const sheet = buildSheet(name, grid);
  // Замечания про саму книгу идут первыми: они объясняют, откуда взяты строки.
  sheet.warnings.unshift(...notes);
  return sheet;
}
