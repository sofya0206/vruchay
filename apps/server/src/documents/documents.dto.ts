import { z } from 'zod';
import { sheetLayout } from '@gramota/shared';

/** Лист не меньше визитки и не больше A2 — защита от абсурдных значений в рендере. */
const pageSizeMm = z.number().min(50).max(600);

export const createDocumentSchema = z.object({
  title: z.string().trim().min(1, 'Введите название').max(200),
  pageWidthMm: pageSizeMm.default(297),
  pageHeightMm: pageSizeMm.default(210),
});
export type CreateDocumentDto = z.infer<typeof createDocumentSchema>;

export const updateDocumentSchema = z
  .object({
    title: z.string().trim().min(1, 'Введите название').max(200),
    pageWidthMm: pageSizeMm,
    pageHeightMm: pageSizeMm,
    verifyEnabled: z.boolean(),
    verifyFields: z.array(z.string().max(64)).max(10),

    /*
     * Мероприятие: одно на весь документ, а не колонка в таблице.
     * У соревнования одно название и одни даты на всех трёхсот
     * участников, и держать их в трёхстах одинаковых ячейках — значит
     * триста раз дать возможность опечататься.
     *
     * Даты строкой, а не датой: организаторы пишут их живым языком —
     * «17–19 июня 2026», «сезон 2025/26», «март — май». Календарное
     * поле заставило бы выбрать один день там, где его нет.
     */
    eventName: z.string().trim().max(300),
    eventDate: z.string().trim().max(100),
    eventPlace: z.string().trim().max(200),
    eventHours: z.string().trim().max(50),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Нечего обновлять');
export type UpdateDocumentDto = z.infer<typeof updateDocumentSchema>;

export const updateSheetSchema = z.object({
  layout: sheetLayout,
});
export type UpdateSheetDto = z.infer<typeof updateSheetSchema>;

export const listDocumentsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  search: z.string().trim().max(200).optional(),
  /** Корзина — тот же список, только из удалённого. */
  trashed: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});
export type ListDocumentsDto = z.infer<typeof listDocumentsSchema>;

/** Идентификаторы в маршрутах — только UUID, иначе запрос отвергается до похода в базу. */
export const uuidSchema = z.string().uuid('Некорректный идентификатор');
