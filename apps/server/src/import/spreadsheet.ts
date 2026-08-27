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

export async function parseWorkbook(buffer: Buffer): Promise<{ name: string; grid: string[][] }> {
  const workbook = new ExcelJS.Workbook();
  // ExcelJS типизирован под собственный Buffer из своих зависимостей;
  // на рантайме это обычный Node.js Buffer.
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);

  const sheet = workbook.worksheets.find((ws) => ws.state !== 'hidden') ?? workbook.worksheets[0];
  if (!sheet) throw new Error('В файле нет ни одного листа');

  const grid: string[][] = [];
  sheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    const values: string[] = [];
    for (let col = 1; col <= Math.min(sheet.columnCount || 0, MAX_COLUMNS); col++) {
      values.push(cellText(row.getCell(col)));
    }
    grid[rowNumber - 1] = values;
  });

  fillMergedCells(sheet, grid);
  return { name: sheet.name, grid: grid.map((r) => r ?? []) };
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

export function cellText(cell: ExcelJS.Cell): string {
  const value = cell.value;
  const numFmt = cell.numFmt ?? '';
  if (value === null || value === undefined) return '';
  if (value instanceof Date) {
    return isTimeFormat(numFmt) ? formatDuration(durationSeconds(value), numFmt) : formatDate(value);
  }
  if (typeof value === 'number') {
    // Длительность в Excel — это доля суток. Без учёта формата «1:02,45»
    // превратилось бы в «0,000723» или в дату 30 декабря 1899 года.
    return isTimeFormat(numFmt) ? formatDuration(value * 86400, numFmt) : formatNumber(value);
  }
  if (typeof value === 'object') {
    // Формула: берём сохранённый результат. Если его нет — ячейка пустая,
    // и это отдельно попадает в предупреждения.
    if ('result' in value) return value.result === undefined ? '' : String(value.result).trim();
    if ('richText' in value) return value.richText.map((part) => part.text).join('').trim();
    if ('text' in value) return String(value.text).trim();
    return '';
  }
  return String(value).trim();
}

function formatDate(date: Date): string {
  // Дата из книги приходит в UTC — в местном поясе она уехала бы на сутки.
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

/**
 * Формат ячейки описывает длительность, а не дату: есть секунды или часы
 * и нет года. Отличить одно от другого по самому значению нельзя — в файле
 * и там и там лежит одно и то же число.
 */
function isTimeFormat(numFmt: string): boolean {
  if (!numFmt) return false;
  const fmt = numFmt.toLowerCase();
  if (fmt.includes('y')) return false;
  if (!/[hs]/.test(fmt)) return false;
  // «dd.mm.yyyy hh:mm» — это всё-таки дата; день рядом с временем её выдаёт.
  return !fmt.includes('d');
}

/** Сколько секунд прошло от начала суток книги: у длительности это и есть значение. */
function durationSeconds(date: Date): number {
  const dayStart = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return (date.getTime() - dayStart) / 1000;
}

/**
 * Время дистанции так, как его пишут в протоколе: «1:02,45», «58,30»,
 * «1:02:03,50». Число знаков после запятой берём из формата ячейки: сколько
 * нулей в «mm:ss.00», столько и печатаем, иначе теряется сотая — а по сотой
 * в плавании расходятся первое и второе место.
 */
function formatDuration(totalSeconds: number, numFmt: string): string {
  const decimals = /\.(0+)/.exec(numFmt)?.[1].length ?? 2;
  const factor = 10 ** decimals;
  const rounded = Math.round(totalSeconds * factor) / factor;

  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const seconds = rounded % 60;
  const width = decimals > 0 ? decimals + 3 : 2;
  const secondsText = seconds.toFixed(decimals).padStart(width, '0').replace('.', ',');

  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${secondsText}`;
  if (minutes > 0) return `${minutes}:${secondsText}`;
  // Меньше минуты — ведущий ноль не пишут: «58,30», а не «058,30».
  return secondsText.replace(/^0(?=\d)/, '');
}

/**
 * Число с запятой: значения из протокола попадают на грамоту как есть,
 * а «798.25» на русском наградном документе выглядит опечаткой. Разряды
 * не разделяем — иначе год рождения превратился бы в «2 008».
 */
function formatNumber(value: number): string {
  return String(value).replace('.', ',');
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

export function buildSheet(name: string, grid: string[][]): ParsedSheet {
  const warnings: string[] = [];
  const headerRowIndex = detectHeaderRow(grid);
  const headerRow = grid[headerRowIndex] ?? [];

  // Пустые колонки справа и посередине отбрасываем вместе с их данными.
  const keptColumns = headerRow
    .map((value, index) => ({ value: value.trim(), index }))
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
  for (let i = headerRowIndex + 1; i < grid.length && rows.length < MAX_ROWS; i++) {
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
  if (skippedEmptyRows > 0) {
    warnings.push(`Пропущено пустых строк: ${skippedEmptyRows}`);
  }
  if (grid.length - headerRowIndex - 1 > MAX_ROWS) {
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
  const { name, grid } = await parseWorkbook(buffer);
  return buildSheet(name, grid);
}
