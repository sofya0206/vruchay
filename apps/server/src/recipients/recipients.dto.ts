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
  /** Пусто — применить ко всем строкам документа. */
  rowIds: z.array(z.string().uuid()).max(5000).optional(),
});
export type SetCheckedDto = z.infer<typeof setCheckedSchema>;

/** Импорт: до 5000 строк за раз — дальше упирается уже не парсер, а генерация. */
export const importSchema = z.object({
  columns: z.array(columnName).min(1).max(30),
  rows: z.array(z.array(z.string().max(1000)).max(30)).max(5000),
  /** Дописать к существующим строкам или заменить таблицу целиком. */
  mode: z.enum(['append', 'replace']).default('append'),
});
export type ImportDto = z.infer<typeof importSchema>;

/** Списки участников — это десятки килобайт; всё крупнее почти наверняка ошибка. */
export const MAX_TABLE_BYTES = 10 * 1024 * 1024;
