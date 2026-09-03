import { buildSheet, isCsv, parseCsv, parseWorkbook } from './spreadsheet';
import type { HeaderMode, ParsedSheet } from './spreadsheet';
import { buildProtocol } from './protocol';
import type { ParsedProtocol, ProtocolGroup } from './protocol';

/**
 * Единая точка разбора загруженного файла со списком получателей.
 *
 * Файл может быть двумя разными вещами. Список участников курса — обычная
 * таблица: шапка, строки, почта. Протокол соревнований — документ со своей
 * формой: группы, места, снятые, двухуровневая шапка. Разбирать протокол
 * общим кодом можно, но тогда группа теряется, а вместе с ней и весь смысл
 * награждения по местам.
 *
 * Поэтому пробуем прочитать файл как протокол и оставляем это прочтение,
 * только если в нём нашлось то, чего в обычном списке не бывает: графа
 * места или разбиение на группы. Иначе возвращаемся к общему разбору —
 * школе, которая грузит список слушателей семинара, протокольные догадки
 * только помешают.
 */
export interface ParsedRecipientFile extends ParsedSheet {
  /** Заполнено, когда файл прочитан как протокол соревнований. */
  protocol?: {
    /** Колонка, по которой строки делятся на группы. Пусто — групп нет. */
    groupColumn: string;
    groups: ProtocolGroup[];
    /** Один уровень шапки или два. */
    headerRowCount: number;
  };
}

/** В обычном списке получателей ни мест, ни групп не бывает. */
function looksLikeProtocol(parsed: ParsedProtocol): boolean {
  return parsed.groups.length > 0 || parsed.columns.some((c) => c.suggested === 'place');
}

function toSheet(parsed: ParsedProtocol): ParsedRecipientFile {
  return {
    sheetName: parsed.sheetName,
    headerRowIndex: parsed.headerRowIndex,
    columns: parsed.columns,
    rows: parsed.rows,
    skippedEmptyRows: parsed.skippedEmptyRows,
    warnings: parsed.warnings,
    // Шапка протокола найдена самим разбором протокола — переспрашивать
    // пользователя переключателем «данные без шапки» здесь не о чем.
    headerMode: 'headers',
    firstRowLooksLikeData: false,
    // Правки текста (регистр, похожие на латиницу буквы) протокол не предлагает:
    // это разбор списка участников курса, а не соревнований.
    suggestions: [],
    protocol: {
      groupColumn: parsed.groupColumn,
      groups: parsed.groups,
      headerRowCount: parsed.headerRowCount,
    },
  };
}

export async function parseRecipientFile(
  buffer: Buffer,
  filename: string,
  mode: HeaderMode = 'auto',
): Promise<ParsedRecipientFile> {
  /*
   * CSV читаем тем же путём, что и книгу.
   *
   * Раньше любой CSV уходил в общий разбор, минуя протокольный. Судейские
   * программы выгружают протокол именно в CSV — и вместе с этой веткой
   * терялись группы, места внутри группы, перенос снятых и приведение
   * ЗАГЛАВНЫХ фамилий к обычному виду. Формат файла ничего не говорит
   * о том, протокол это или список слушателей семинара; решает содержимое,
   * как и для .xlsx.
   */
  const { name, grid, notes } = isCsv(filename)
    ? { name: baseName(filename), grid: parseCsv(buffer), notes: [] as string[] }
    : await readWorkbook(buffer);

  try {
    const protocol = buildProtocol(name, grid);
    if (looksLikeProtocol(protocol)) return withName(withNotes(toSheet(protocol), notes));
  } catch {
    // Протокольное прочтение — попытка, а не обязанность. Не удалось —
    // читаем как обычную таблицу и сообщаем о проблемах уже оттуда.
  }
  return withName(withNotes(buildSheet(name, grid, mode), notes));
}

/**
 * ФИО, разнесённое по трём колонкам, собирается в одну.
 *
 * Половина выгрузок хранит фамилию, имя и отчество отдельно. Макет же
 * печатает `%name` и производные от него — падежи, сокращение, латиницу, —
 * и без колонки «name» на бумаге выходило пустое место, хотя все три
 * части лежали в таблице рядом.
 *
 * Собранную колонку добавляем, а исходные оставляем: организатор мог
 * печатать их по отдельности, и отнимать у него эту возможность незачем.
 */
function withName<T extends ParsedSheet>(sheet: T): T {
  const has = (suggested: string) => sheet.columns.findIndex((c) => c.suggested === suggested);
  if (has('name') !== -1) return sheet;

  const surname = has('surname');
  const firstname = has('firstname');
  const patronymic = has('patronymic');
  // Одного отчества или одного имени мало: «Петрович» вместо ФИО хуже пустоты.
  if (surname === -1 || (firstname === -1 && patronymic === -1)) return sheet;

  const parts = [surname, firstname, patronymic].filter((i) => i !== -1);
  return {
    ...sheet,
    columns: [...sheet.columns, { source: 'ФИО', suggested: 'name' }],
    rows: sheet.rows.map((row) => [
      ...row,
      parts
        .map((i) => (row[i] ?? '').trim())
        .filter(Boolean)
        .join(' '),
    ]),
    warnings: [
      ...sheet.warnings,
      'ФИО собрано из колонок «Фамилия», «Имя» и «Отчество» — в таблице добавлена колонка «ФИО»',
    ],
  };
}

/**
 * Замечания о книге — часть ответа, а не отладочный вывод.
 *
 * `parseWorkbook` их формирует («список найден на другом листе», «в книге
 * есть ещё листы со списками»), но раньше они не доходили до человека:
 * оба прочтения собирали свои warnings с нуля. Молча пропавшая дистанция
 * на соседнем листе — это недосчитанное награждение.
 */
function withNotes<T extends { warnings: string[] }>(sheet: T, notes: string[]): T {
  if (!notes.length) return sheet;
  return { ...sheet, warnings: [...notes, ...sheet.warnings] };
}

/** Имя листа для CSV: у файла его нет, берём имя самого файла. */
function baseName(filename: string): string {
  return filename.replace(/\.[^.]+$/, '') || 'Список';
}

/**
 * Чтение книги с понятным отказом.
 *
 * ExcelJS читает только .xlsx. Старый .xls и выгрузки, которые на самом
 * деле HTML с расширением .xls, роняют его на разборе zip: человек видел
 * «Can't find end of central directory : is this a zip file?» и не мог
 * догадаться, что делать. Теперь ему говорят, что делать.
 */
async function readWorkbook(buffer: Buffer) {
  try {
    return await parseWorkbook(buffer);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/zip|central directory|corrupt/i.test(message)) {
      throw new Error(
        'Файл не читается как книга Excel. Такое бывает со старым форматом .xls ' +
          'и с выгрузками, которые на самом деле веб-страница с расширением .xls. ' +
          'Откройте файл в Excel или Google Таблицах и сохраните как .xlsx или .csv',
      );
    }
    throw err;
  }
}
