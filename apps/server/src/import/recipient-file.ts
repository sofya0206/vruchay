import { buildSheet, isCsv, parseSpreadsheet, parseWorkbook } from './spreadsheet';
import type { ParsedSheet } from './spreadsheet';
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
): Promise<ParsedRecipientFile> {
  if (isCsv(filename)) return parseSpreadsheet(buffer, filename);

  const { name, grid } = await parseWorkbook(buffer);
  try {
    const protocol = buildProtocol(name, grid);
    if (looksLikeProtocol(protocol)) return toSheet(protocol);
  } catch {
    // Протокольное прочтение — попытка, а не обязанность. Не удалось —
    // читаем как обычную таблицу и сообщаем о проблемах уже оттуда.
  }
  return buildSheet(name, grid);
}
