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
