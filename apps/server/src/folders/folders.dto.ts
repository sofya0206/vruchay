import { z } from 'zod';

/**
 * Название папки: то, что человек напечатал, без ведущих и хвостовых пробелов.
 *
 * Предел в сто знаков — не формальность: колонка слева узкая, и название
 * длиннее строки всё равно обрежется многоточием. Лучше не дать завести
 * то, что нельзя прочитать, чем показывать «Аккредитации и проп…».
 */
const folderName = z.string().trim().min(1, 'Введите название папки').max(100);

export const createFolderSchema = z.object({ name: folderName });
export type CreateFolderDto = z.infer<typeof createFolderSchema>;

export const updateFolderSchema = z.object({ name: folderName });
export type UpdateFolderDto = z.infer<typeof updateFolderSchema>;

/**
 * Новый порядок папок — весь список идентификаторов целиком, а не пара
 * «папка и её номер».
 *
 * Перетаскивание сдвигает не одну папку, а все, что стоят между старым
 * и новым местом. Присылать их по одной значило бы несколько запросов на
 * один жест, и обрыв связи посередине оставил бы колонку в порядке,
 * которого человек не выбирал.
 *
 * Сотня папок — тот же предел, что и у выборки: столько их в колонке
 * всё равно не разглядеть, а запрос на миллион строк принимать незачем.
 */
export const reorderFoldersSchema = z.object({
  ids: z.array(z.string().uuid('Некорректный идентификатор')).min(1).max(100),
});
export type ReorderFoldersDto = z.infer<typeof reorderFoldersSchema>;
