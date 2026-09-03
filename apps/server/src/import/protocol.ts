import { isNoPlace, parsePlace, parseStatus } from '@gramota/shared';
import { parseWorkbook } from './spreadsheet';
import { suggestColumnName } from './column-names';
import { isJunkRow, junkRowsWarning } from './junk-rows';

/**
 * Разбор протокола соревнований.
 *
 * Отдельно от общего разбора таблиц, потому что протокол — не список
 * получателей, а документ со своей формой. В нём есть то, чего в списке
 * участников курса не бывает:
 *  — шапка в два уровня: «Участник» над «Фамилия, имя» и «Г.р.»;
 *  — несколько групп в одном файле, и место считается внутри группы;
 *  — группы обозначены то отдельной колонкой, то строкой поперёк таблицы;
 *  — снятые: DSQ, DNS, DNF — иногда своей графой, иногда прямо вместо места;
 *  — делёж мест: «3-4» и «=3»;
 *  — ФИО заглавными, год рождения вместо даты, время как «1:02,45».
 *
 * Главное, ради чего это написано: **место в протоколе принадлежит группе,
 * а не файлу**. Первых мест в протоколе на восемь возрастных категорий
 * восемь. Разбор, который теряет группу, превращает награждение в ошибку,
 * которую заметят на сцене.
 */

/** Колонка таблицы: как называлась в файле и как называется переменной. */
export interface ProtocolColumn {
  source: string;
  suggested: string;
}

export interface ProtocolGroup {
  title: string;
  rowCount: number;
}

export interface ParsedProtocol {
  sheetName: string;
  /** Номер первой строки шапки, от нуля, в координатах файла. */
  headerRowIndex: number;
  /** Сколько строк заняла шапка: один уровень или два. */
  headerRowCount: number;
  columns: ProtocolColumn[];
  rows: string[][];
  /** Имя колонки с группой. Пусто — групп в файле нет. */
  groupColumn: string;
  groups: ProtocolGroup[];
  skippedEmptyRows: number;
  warnings: string[];
}

const MAX_ROWS = 5000;
const MAX_COLUMNS = 30;
const HEADER_SEARCH_DEPTH = 15;

/**
 * Заголовки протокола поверх общего словаря.
 *
 * Свой словарь, а не правка общего: «Примечание» в списке участников курса
 * — это примечание, и переименовывать его в статус там незачем. В протоколе
 * та же графа означает снятие с дистанции.
 */
const PROTOCOL_COLUMNS: [RegExp, string][] = [
  [/^(мест|place)/i, 'place'],
  [/^(г\.?\s*р\.?|год\s*рожд|дата\s*рожд|д\.?\s*р\.?)$/i, 'birth_year'],
  [/^(год\s*рожд|дата\s*рожд)/i, 'birth_year'],
  [/^(групп|возрастн|категор|дистанц|вид\s*программ|класс|весов)/i, 'category'],
  [/^(прим|отметк|статус|состояние)/i, 'status'],
  [/^(очк|балл)/i, 'points'],
  [/^(врем|результат|итог)/i, 'result'],
  [/^(тренер|наставник|представител)/i, 'coach'],
  [/^(команд|клуб|организац|общество|регион|город|субъект|territor)/i, 'team'],
  [/^(фамилия[,\s]+имя|ф\.?\s*и\.?\s*о|фио|участник|спортсмен|уч-?к)/i, 'name'],
  [/^(разряд|звание|квалификац)/i, 'rank_title'],
  [/^(№|n|номер|п\/п|нагрудн)/i, 'number'],
];

/** По этой колонке строки делятся на группы, если она есть в файле. */
const GROUP_COLUMN = 'category';
const NAME_COLUMN = 'name';
const PLACE_COLUMN = 'place';
const STATUS_COLUMN = 'status';

export function protocolColumnName(header: string, taken: Set<string>): string {
  const trimmed = header.trim();
  for (const [pattern, name] of PROTOCOL_COLUMNS) {
    if (!pattern.test(trimmed)) continue;
    if (!taken.has(name)) return name;
    // Одноимённые графы встречаются («Место» в личном и в командном зачёте) —
    // разводим суффиксом, как это делает общий словарь.
    let n = 2;
    while (taken.has(`${name}_${n}`)) n++;
    return `${name}_${n}`;
  }
  return suggestColumnName(trimmed, taken);
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
 * Строка-плашка: во всех заполненных ячейках один и тот же текст.
 *
 * Так выглядит объединённая ячейка поперёк таблицы — и название протокола
 * сверху, и заголовок группы посередине. За шапку её принимать нельзя:
 * «ПРОТОКОЛ РЕЗУЛЬТАТОВ», растянутый на шесть колонок, читается как шесть
 * прекрасных заголовков и уводит разбор в первую строку файла.
 */
function isBanner(row: string[]): boolean {
  const filled = row.map((c) => c.trim()).filter((c) => c !== '');
  return filled.length >= 2 && filled.every((c) => c === filled[0]);
}

function labelScore(row: string[]): number {
  if (isBanner(row)) return -Infinity;
  let labels = 0;
  let data = 0;
  for (const cell of row) {
    if (cell.trim() === '') continue;
    if (looksLikeData(cell)) data++;
    else labels++;
  }
  return labels < 2 ? -Infinity : labels - data;
}

/**
 * Строка целиком состоит из заголовков.
 *
 * Требование строгое — ни одной ячейки, похожей на данные. Для второго
 * уровня шапки послабления недопустимы: первая строка данных тоже набирает
 * два-три «заголовка» из фамилий и названий команд, и мягкая проверка
 * съедала бы её вместе с участником.
 */
function isHeaderLike(row: string[]): boolean {
  if (isBanner(row)) return false;
  const filled = row.map((c) => c.trim()).filter((c) => c !== '');
  return filled.length >= 2 && filled.every((c) => !looksLikeData(c));
}

/**
 * Где начинается шапка и сколько строк занимает.
 *
 * Второй уровень опознаём так: следующая строка тоже похожа на заголовки
 * и при этом хотя бы в одной колонке отличается от верхней. Если она
 * повторяет верхнюю целиком — это вертикальное объединение, а не второй
 * уровень, и брать её нечего.
 */
export function detectHeaderSpan(grid: string[][]): { index: number; rows: number } {
  const limit = Math.min(grid.length, HEADER_SEARCH_DEPTH);
  let best = { index: 0, score: -Infinity };
  for (let i = 0; i < limit; i++) {
    const score = labelScore(grid[i] ?? []);
    if (score > best.score) best = { index: i, score };
  }
  const index = best.score === -Infinity ? 0 : best.index;

  const top = grid[index] ?? [];
  const next = grid[index + 1] ?? [];
  // Второй уровень обязан что-то уточнять хотя бы в двух колонках: там, где
  // он повторяет верхний, это вертикальное объединение, а не второй уровень.
  const refined = next.filter(
    (cell, i) => cell.trim() !== '' && cell.trim() !== (top[i] ?? '').trim(),
  ).length;

  return { index, rows: isHeaderLike(next) && refined >= 2 ? 2 : 1 };
}

/**
 * Склейка двух уровней шапки. Имя переменной берём из нижнего уровня —
 * он точнее: «Участник Фамилия, имя» и «Участник Г.р.» иначе дали бы
 * две колонки с именем `name`.
 */
function buildHeader(
  grid: string[][],
  span: { index: number; rows: number },
): { source: string; naming: string; index: number }[] {
  const top = grid[span.index] ?? [];
  const bottom = span.rows === 2 ? (grid[span.index + 1] ?? []) : [];
  const width = Math.max(top.length, bottom.length);

  const header: { source: string; naming: string; index: number }[] = [];
  for (let i = 0; i < Math.min(width, MAX_COLUMNS); i++) {
    const upper = (top[i] ?? '').trim();
    const lower = (bottom[i] ?? '').trim();
    const naming = lower || upper;
    if (naming === '') continue;
    const source = !lower || lower === upper ? upper : upper ? `${upper} · ${lower}` : lower;
    header.push({ source, naming, index: i });
  }
  return header;
}

/**
 * Строка-заголовок группы: «Юноши 16-17 лет, 100 м вольный стиль».
 *
 * Опознаём два надёжных вида и намеренно не пытаемся угадывать третий:
 *  — ячейка растянута поперёк таблицы, поэтому во всех колонках один текст;
 *  — заполнена ровно одна ячейка, а графа с ФИО пуста.
 * Во втором случае строка всё равно не годится в участники: без имени
 * из неё не выйдет ни одного документа, и назвать её группой строго лучше,
 * чем выпустить документ без получателя.
 */
export function looksLikeGroupTitle(values: string[], nameIndex: number): string | null {
  const filled = values.map((v, i) => ({ v: v.trim(), i })).filter((c) => c.v !== '');
  if (filled.length === 0) return null;

  const text = filled[0].v;
  if (text.length < 2 || text.length > 200) return null;
  if (/^[\d\s.,:/-]+$/.test(text)) return null;

  const allSame = filled.length >= 2 && filled.every((c) => c.v === text);
  const loneWithoutName =
    filled.length === 1 && (nameIndex < 0 || (values[nameIndex] ?? '').trim() === '');

  return allSame || loneWithoutName ? text : null;
}

/**
 * ФИО заглавными приводим к обычному виду.
 *
 * Так выгружает большинство судейских программ, а на грамоте «ИВАНОВ ИВАН»
 * — это крик. Регистр на листе задаётся оформлением текстового блока,
 * и вернуть заглавные можно одной галочкой; восстановить строчные из
 * заглавных вручную на трёхстах строках нельзя. Кроме того, склонение
 * в дательный падеж на «ИВАНОВУ» не срабатывает.
 *
 * Строки со смешанным регистром не трогаем: там человек уже решил, как надо.
 */
export function normalizeFullName(value: string): string {
  const text = value.trim();
  if (!/\p{Lu}/u.test(text)) return text;
  if (/\p{Ll}/u.test(text)) return text;

  // Слово — это подряд идущие буквы. Дефис и апостроф разделяют слова,
  // а не входят в них: иначе «О’БРАЙЕН» стало бы «О’брайен».
  return text.replace(/\p{L}+/gu, (word) =>
    word.length === 1 ? word : word[0] + word.slice(1).toLowerCase(),
  );
}

export async function parseProtocol(buffer: Buffer): Promise<ParsedProtocol> {
  const { name, grid } = await parseWorkbook(buffer);
  return buildProtocol(name, grid);
}

export function buildProtocol(sheetName: string, grid: string[][]): ParsedProtocol {
  const warnings: string[] = [];
  const span = detectHeaderSpan(grid);
  const header = buildHeader(grid, span);
  if (!header.length) throw new Error('Не удалось определить шапку таблицы');

  const taken = new Set<string>();
  const columns: ProtocolColumn[] = header.map((h) => {
    const suggested = protocolColumnName(h.naming, taken);
    taken.add(suggested);
    return { source: h.source, suggested };
  });

  const at = (column: string) => columns.findIndex((c) => c.suggested === column);
  const nameIndex = at(NAME_COLUMN);
  const placeIndex = at(PLACE_COLUMN);
  let statusIndex = at(STATUS_COLUMN);
  const columnGroupIndex = at(GROUP_COLUMN);

  const dataStart = span.index + span.rows;
  const rows: string[][] = [];
  const rowGroups: string[] = [];
  const groups: ProtocolGroup[] = [];
  let sectionGroup = '';
  let skippedEmptyRows = 0;
  let skippedJunkRows = 0;
  let overflow = false;

  for (let i = dataStart; i < grid.length; i++) {
    const source = grid[i] ?? [];
    const values = header.map((h) => (source[h.index] ?? '').trim());

    if (values.every((v) => v === '')) {
      skippedEmptyRows++;
      continue;
    }

    const title = looksLikeGroupTitle(values, nameIndex);
    if (title !== null) {
      sectionGroup = title;
      continue;
    }

    /*
     * Итоги, подписи судейской коллегии и повтор шапки на новой странице —
     * не участники. Раньше они становились получателями и уезжали
     * в награждение наравне с живыми людьми.
     */
    if (isJunkRow(values, header.map((h) => h.source))) {
      skippedJunkRows++;
      continue;
    }

    if (rows.length >= MAX_ROWS) {
      overflow = true;
      break;
    }

    rows.push(values);
    rowGroups.push(columnGroupIndex >= 0 ? values[columnGroupIndex] : sectionGroup);
  }

  /*
   * Группа из строки-заголовка становится обычной колонкой: дальше её
   * читают правила награждения, а они знают только про колонки. Колонку
   * дописываем в начало — так она видна в таблице получателей рядом с ФИО,
   * а не за краем экрана.
   */
  let groupColumn = '';
  if (columnGroupIndex >= 0) {
    groupColumn = columns[columnGroupIndex].suggested;
  } else if (rowGroups.some((g) => g !== '')) {
    groupColumn = GROUP_COLUMN;
    columns.unshift({ source: 'Группа', suggested: GROUP_COLUMN });
    rows.forEach((row, i) => row.unshift(rowGroups[i]));
    if (statusIndex >= 0) statusIndex++;
  }

  for (const group of rowGroups) {
    if (group === '') continue;
    const known = groups.find((g) => g.title === group);
    if (known) known.rowCount++;
    else groups.push({ title: group, rowCount: 1 });
  }

  const shift = groupColumn === GROUP_COLUMN && columnGroupIndex < 0 ? 1 : 0;
  const place = placeIndex >= 0 ? placeIndex + shift : -1;
  const nameAt = nameIndex >= 0 ? nameIndex + shift : -1;

  const movedStatuses = extractStatusesFromPlace(rows, columns, place, statusIndex);
  const renamedNames = nameAt >= 0 ? normalizeNames(rows, nameAt) : 0;

  // ─── Предупреждения ──────────────────────────────────────────────────────

  if (span.index > 0) {
    warnings.push(
      `Шапка найдена в строке ${span.index + 1}; строки выше пропущены как заголовок файла`,
    );
  }
  if (span.rows === 2) {
    warnings.push('Шапка в два уровня — заголовки склеены, имена колонок взяты из нижнего');
  }
  if (groups.length) {
    warnings.push(
      `Найдено групп: ${groups.length} (${groups
        .slice(0, 5)
        .map((g) => `${g.title} — ${g.rowCount}`)
        .join('; ')}${groups.length > 5 ? '; …' : ''}). ` +
        'Сверьте разбиение: по нему ищутся повторы получателя и, если понадобится, ' +
        'пересчитывается место внутри группы',
    );
  }
  if (placeIndex >= 0 && !groups.length) {
    warnings.push(
      'Колонка с местом есть, а групп в файле не нашлось. Места берутся как ' +
        'написаны. Если групп несколько, а нумерация в файле сквозная, укажите ' +
        'колонку группы вручную — иначе победитель окажется один на весь протокол',
    );
  }
  if (movedStatuses > 0) {
    warnings.push(
      `В графе места вместо места стояла отметка о снятии (${movedStatuses} шт.) — ` +
        'перенесли её в колонку статуса',
    );
  }
  if (renamedNames > 0) {
    warnings.push(
      `ФИО заглавными приведены к обычному виду (${renamedNames} шт.). ` +
        'Заглавные буквы на грамоте включаются оформлением текстового блока',
    );
  }
  if (skippedEmptyRows > 0) warnings.push(`Пропущено пустых строк: ${skippedEmptyRows}`);
  if (skippedJunkRows > 0) warnings.push(junkRowsWarning(skippedJunkRows));
  if (overflow) {
    warnings.push(
      `Взяты первые ${MAX_ROWS} строк — остальные не поместились и в награждение не попадут`,
    );
  }

  return {
    sheetName,
    headerRowIndex: span.index,
    headerRowCount: span.rows,
    columns,
    rows,
    groupColumn,
    groups,
    skippedEmptyRows,
    warnings,
  };
}

/**
 * Отметка о снятии, вписанная в графу места.
 *
 * Судейские программы нередко пишут «DSQ» прямо вместо места. Оставить это
 * в графе места — значит получить участника без места и без статуса: правило
 * «не выдавать снятым» его не увидит, а правило «иначе» выдаст ему грамоту.
 */
function extractStatusesFromPlace(
  rows: string[][],
  columns: ProtocolColumn[],
  placeIndex: number,
  statusIndex: number,
): number {
  if (placeIndex < 0) return 0;

  const candidates = rows.filter((row) => {
    const raw = row[placeIndex] ?? '';
    if (raw.trim() === '' || isNoPlace(raw) || parsePlace(raw) !== null) return false;
    const status = parseStatus(raw);
    return status !== null && status !== 'ok';
  });
  if (!candidates.length) return 0;

  let target = statusIndex;
  if (target < 0) {
    target = columns.length;
    columns.push({ source: 'Статус', suggested: STATUS_COLUMN });
    for (const row of rows) row.push('');
  }

  for (const row of candidates) {
    // Уже заполненный статус сильнее: он написан в своей графе осознанно.
    if ((row[target] ?? '').trim() === '') row[target] = row[placeIndex];
    row[placeIndex] = '';
  }
  return candidates.length;
}

function normalizeNames(rows: string[][], nameIndex: number): number {
  let changed = 0;
  for (const row of rows) {
    const before = row[nameIndex] ?? '';
    const after = normalizeFullName(before);
    if (after !== before) {
      row[nameIndex] = after;
      changed++;
    }
  }
  return changed;
}
