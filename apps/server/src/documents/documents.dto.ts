import { z } from 'zod';
import { DOCUMENT_CATEGORY_IDS, sheetLayout, STARTER_PRESETS } from '@gramota/shared';
import { parseIsoDuration } from '../verify/expiry';

/** Лист не меньше визитки и не больше A2 — защита от абсурдных значений в рендере. */
const pageSizeMm = z.number().min(50).max(600);

/*
 * Раздел и заготовка приходят от клиента строками, но допустимые значения
 * задаёт общий пакет: список один для интерфейса, сервера и проверки.
 * Список нельзя строить из строк на лету — тогда любая опечатка клиента
 * молча становилась бы новым разделом, по которому ничего не найти.
 */
const documentCategory = z.enum(DOCUMENT_CATEGORY_IDS as [string, ...string[]]);
const starterPresetId = z.enum(
  STARTER_PRESETS.map((p) => p.id) as [string, ...string[]],
);

export const createDocumentSchema = z.object({
  title: z.string().trim().min(1, 'Введите название').max(200),
  pageWidthMm: pageSizeMm.default(297),
  pageHeightMm: pageSizeMm.default(210),
  category: documentCategory.optional(),
  /**
   * Заготовка: с ней материал создаётся сразу с расставленным текстом.
   * Макет строит сервер, а не клиент, — по тем же правилам, что проверяет
   * схема. Иначе клиент мог бы прислать что угодно под видом заготовки.
   */
  presetId: starterPresetId.optional(),
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

    /** null — убрать материал из разделов, а не «не менять». */
    category: documentCategory.nullable(),

    /*
     * Срок действия: длительность от выдачи (`P1Y`) или фиксированная
     * дата. null — снять срок. Длительность проверяем той же функцией,
     * что считает срок при выпуске: иначе в базу попала бы запись,
     * которую воркер потом молча проигнорирует.
     */
    expiresIn: z
      .string()
      .trim()
      .max(20)
      .refine((v) => parseIsoDuration(v) !== null, 'Срок задаётся как P1Y, P6M, P2W или P30D')
      .transform((v) => v.toUpperCase())
      .nullable(),
    expiresAt: z.coerce.date('Не удалось разобрать дату окончания срока').nullable(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Нечего обновлять');
export type UpdateDocumentDto = z.infer<typeof updateDocumentSchema>;

export const updateSheetSchema = z.object({
  layout: sheetLayout,
});
export type UpdateSheetDto = z.infer<typeof updateSheetSchema>;

/**
 * Порядок в библиотеке.
 *
 * По умолчанию — по времени правки: человек возвращается к тому, над чем
 * работал вчера, а не к тому, что завёл год назад.
 */
export const DOCUMENT_SORTS = ['updated', 'created', 'title'] as const;

export const listDocumentsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  search: z.string().trim().max(200).optional(),
  category: documentCategory.optional(),
  sort: z.enum(DOCUMENT_SORTS).default('updated'),
  /** Корзина — тот же список, только из удалённого. */
  trashed: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});
export type ListDocumentsDto = z.infer<typeof listDocumentsSchema>;

/** Идентификаторы в маршрутах — только UUID, иначе запрос отвергается до похода в базу. */
export const uuidSchema = z.string().uuid('Некорректный идентификатор');
