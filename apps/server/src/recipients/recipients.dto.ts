import { z } from 'zod';

/**
 * Имя колонки одновременно является именем переменной в макете (%name),
 * поэтому набор символов совпадает с VARIABLE_RE из общего пакета.
 * Кириллические имена не допускаем: иначе %ФИО в шаблоне не распознается.
 */
export const columnName = z
  .string()
  .trim()
  .min(1, 'Введите название колонки')
  .max(64)
  .regex(
    /^[a-zA-Z][a-zA-Z0-9_]*$/,
    'Латинские буквы, цифры и подчёркивание; первым символом — буква',
  );

/** Значения ячеек — только строки: в макет они попадают как текст. */
export const rowData = z.record(columnName, z.string().max(1000));

/**
 * Как читать первую строку разбираемого файла — параметр запроса.
 * Переключатель в диалоге импорта присылает сюда явный выбор человека,
 * когда разбор угадал неверно.
 */
export const parseQuerySchema = z.object({
  headers: z.enum(['auto', 'headers', 'none']).default('auto'),
});
export type ParseQueryDto = z.infer<typeof parseQuerySchema>;

export const addColumnSchema = z.object({ name: columnName });
export type AddColumnDto = z.infer<typeof addColumnSchema>;

export const renameColumnSchema = z.object({ name: columnName });
export type RenameColumnDto = z.infer<typeof renameColumnSchema>;

export const addRowSchema = z.object({ data: rowData.default({}) });
export type AddRowDto = z.infer<typeof addRowSchema>;

export const updateRowSchema = z
  .object({ data: rowData, checked: z.boolean() })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Нечего обновлять');
export type UpdateRowDto = z.infer<typeof updateRowSchema>;

export const setCheckedSchema = z.object({
  checked: z.boolean(),
  /**
   * Пусто — применить ко всем строкам документа. Потолок тот же, что
   * у импорта: отметить пачкой можно ровно столько строк, сколько влезает
   * в документ, иначе на большом списке отметка упрётся в старый предел.
   */
  rowIds: z.array(z.string().uuid()).max(10000).optional(),
});
export type SetCheckedDto = z.infer<typeof setCheckedSchema>;

/** Импорт: до 10 000 строк за раз — столько же берёт разбор файла (MAX_ROWS). */
export const importSchema = z.object({
  columns: z.array(columnName).min(1).max(30),
  rows: z.array(z.array(z.string().max(1000)).max(30)).max(10000),
  /** Дописать к существующим строкам или заменить таблицу целиком. */
  mode: z.enum(['append', 'replace']).default('append'),
  /**
   * Заголовки, как они звучали в загруженном файле, — по одному на
   * элемент columns, в том же порядке. Только для новых колонок: у уже
   * существующей заголовок из прошлого импорта не трогаем. Необязательно —
   * ручная вставка через API без файла заголовков не знает.
   */
  labels: z.array(z.string().trim().max(200)).max(30).optional(),
});
export type ImportDto = z.infer<typeof importSchema>;

/** Списки участников — это десятки килобайт; всё крупнее почти наверняка ошибка. */
export const MAX_TABLE_BYTES = 10 * 1024 * 1024;

/**
 * Предел тела запроса, из которого исходит Fastify (см. main.ts).
 *
 * Считается по importSchema: десять тысяч строк на шести колонках с русскими
 * именами весят 1,4 МБ, на тридцати — около семи. Шестнадцать мегабайт дают
 * запас на пределы схемы и при этом ограничивают память на один запрос;
 * стандартного мегабайта не хватало, и импорт отвечал 413.
 */
export const MAX_IMPORT_BODY_BYTES = 16 * 1024 * 1024;
