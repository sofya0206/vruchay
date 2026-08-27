import { z } from 'zod';
import { rowData } from '../recipients/recipients.dto';

/**
 * Что можно попросить у проверки.
 *
 * Сами строки клиент не присылает: они уже лежат в базе, и принимать их
 * заново значило бы позволить проверить один список, а выпустить другой.
 * Снаружи приходит только выбор, какие строки смотреть.
 */
export const validateBatchSchema = z.object({
  /**
   * Только отмеченные к выпуску или вся таблица.
   *
   * По умолчанию отмеченные: проверка отвечает на вопрос «что будет,
   * если я нажму выпуск», а нажатие берёт именно отмеченные.
   */
  scope: z.enum(['checked', 'all']).default('checked'),
});
export type ValidateBatchDto = z.infer<typeof validateBatchSchema>;

/**
 * Правка одной ячейки прямо из разбора проблем.
 *
 * Отдельная схема, а не переиспользование updateRowSchema: там правка
 * приходит объектом целиком, а здесь чинится одно поле одной строки,
 * и лишняя свобода на этом маршруте не нужна.
 */
export const fixCellSchema = z.object({
  rowId: z.string().uuid(),
  column: z
    .string()
    .regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, 'Недопустимое имя колонки'),
  value: z.string().max(1000),
});
export type FixCellDto = z.infer<typeof fixCellSchema>;

/**
 * Одно исправление, применённое сразу ко многим строкам.
 *
 * Ради него всё и затевалось: «ФИО прописными» в выгрузке из протокола
 * встречается не в одной строке, а во всех трёхстах, и чинить их по одной —
 * это тот самый ручной труд, от которого сервис избавляет.
 *
 * Ограничение в пять тысяч совпадает с ограничением импорта: больше строк
 * в таблице всё равно не бывает.
 */
export const fixManySchema = z.object({
  fixes: z.array(fixCellSchema).min(1).max(5000),
});
export type FixManyDto = z.infer<typeof fixManySchema>;

/** Снять отметки со строк — «выпустить только чистые». */
export const excludeSchema = z.object({
  rowIds: z.array(z.string().uuid()).min(1).max(5000),
});
export type ExcludeDto = z.infer<typeof excludeSchema>;

export { rowData };
