import { z } from 'zod';
import { FILE_STATES } from './file-state';

/**
 * Сколько выданных документов отдаём одной страницей.
 *
 * Реестр за сезон — это десятки тысяч строк, и отдавать их разом нельзя:
 * браузер держит их все в памяти, а человек смотрит первые двадцать.
 */
export const REGISTRY_PAGE_MAX = 100;

/** Сколько файлов кладём в один архив. */
export const ARCHIVE_MAX_FILES = 2000;

/** Сколько документов принимаем за одно массовое действие. */
export const BULK_MAX_FILES = 500;

/**
 * Переотправка — отдельный предел, вдесятеро меньше.
 *
 * Массовая рассылка по документу проходит через проверку объёма на общем
 * домене (репутация `noreply@vruchay.ru` общая на всех клиентов), а
 * переотправка из реестра идёт мимо неё — она задумана как «доотправить
 * тем, у кого не дошло». Предел удерживает её в этом смысле.
 */
export const RESEND_MAX_FILES = 50;

const mailStates = [
  'none',
  'queued',
  'sent',
  'delivered',
  'opened',
  'bounced',
  'failed',
] as const;

/** Общие для реестра, аналитики и выгрузки фильтры. */
export const registryFilterSchema = z.object({
  search: z.string().trim().max(200).optional(),
  /** Материал, по макету которого выпущен документ. */
  documentId: z.string().uuid('Некорректный идентификатор материала').optional(),
  /** Мероприятие — оно живёт строкой в карточке материала. */
  event: z.string().trim().max(200).optional(),
  state: z.enum(FILE_STATES as [string, ...string[]], 'Неизвестное состояние документа').optional(),
  mail: z.enum(mailStates, 'Неизвестное состояние письма').optional(),
  from: z.coerce.date('Не удалось разобрать дату начала периода').optional(),
  to: z.coerce.date('Не удалось разобрать дату конца периода').optional(),
});
export type RegistryFilterDto = z.infer<typeof registryFilterSchema>;

export const listRegistrySchema = registryFilterSchema.extend({
  limit: z.coerce.number().int().min(1).max(REGISTRY_PAGE_MAX).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type ListRegistryDto = z.infer<typeof listRegistrySchema>;

/**
 * Скачивание пачкой: либо отмеченное, либо всё найденное по фильтру.
 *
 * Идентификаторы приходят строкой через запятую, потому что скачивание —
 * это переход по ссылке, а не запрос из кода: только так браузер сам
 * покажет диалог сохранения и полосу загрузки.
 */
export const archiveSchema = registryFilterSchema.extend({
  ids: z
    .string()
    .trim()
    .max(BULK_MAX_FILES * 37)
    .optional(),
});
export type ArchiveDto = z.infer<typeof archiveSchema>;

/**
 * Сообщения об ошибках — по-русски и по существу.
 *
 * Отбор в реестре человек делает мышью, и попасть сюда он может только
 * через сбой в кабинете или через чужой запрос. И тому и другому нужен
 * ответ, из которого понятно, что случилось, — «Invalid UUID» не годится
 * ни там, ни там.
 */
const fileId = z.string().uuid('Некорректный идентификатор документа');

export const fileIdsSchema = z.object({
  fileIds: z
    .array(fileId)
    .min(1, 'Не отмечено ни одного документа')
    .max(BULK_MAX_FILES, `За раз можно обработать не больше ${BULK_MAX_FILES} документов`),
});
export type FileIdsDto = z.infer<typeof fileIdsSchema>;

/**
 * Причины отзыва. Две, и это не дубль: публичную видит человек с бумагой
 * на странице проверки, внутреннюю — только владелец и управляющий
 * в реестре. Обе необязательны: «выдан по ошибке» уже сказано самим
 * отзывом.
 */
const revokeReasons = {
  reasonPublic: z.string().trim().max(300, 'Публичная причина — не длиннее 300 знаков').optional(),
  reasonInternal: z
    .string()
    .trim()
    .max(1000, 'Внутренняя причина — не длиннее 1000 знаков')
    .optional(),
};

/**
 * Кого отзывать: отмеченные документы либо всё найденное по отбору.
 *
 * Отбор — для случая «утёк бланк» или «ошибка в целом протоколе», когда
 * документов тысячи и отмечать их по одному нельзя. Но отбор обязан
 * быть сужен хотя бы материалом, мероприятием или периодом: пустой отбор
 * означал бы «всё выданное организацией за всё время», и один клик мимо
 * гасил бы всю историю.
 */
const revokeTargetSchema = z
  .object({
    fileIds: z
      .array(fileId)
      .min(1, 'Не отмечено ни одного документа')
      .max(BULK_MAX_FILES, `За раз можно обработать не больше ${BULK_MAX_FILES} документов`)
      .optional(),
    filter: registryFilterSchema.optional(),
  })
  .refine((v) => Boolean(v.fileIds) !== Boolean(v.filter), 'Укажите либо документы, либо отбор')
  .refine(
    (v) => !v.filter || Boolean(v.filter.documentId || v.filter.event || v.filter.from || v.filter.to),
    'Отбор для массового отзыва должен быть сужен материалом, мероприятием или периодом',
  );

export const revokePreviewSchema = revokeTargetSchema;
export type RevokePreviewDto = z.infer<typeof revokePreviewSchema>;

/**
 * Отзыв необратим по смыслу (вернуть проверку можно, но человек с бумагой
 * уже увидел красную страницу), поэтому подтверждается числом: клиент
 * присылает, сколько документов он показал человеку, а сервер отказывает,
 * если по отбору сейчас находится другое число. Список успел измениться —
 * значит, человек подтверждал не то, что будет отозвано.
 */
export const revokeSchema = revokeTargetSchema
  .safeExtend({
    revoked: z.boolean({ error: 'Не указано, отзывать проверку или возвращать' }),
    expectedCount: z.coerce
      .number()
      .int()
      .min(1, 'Подтвердите число документов')
      .max(1_000_000),
    ...revokeReasons,
  })
  .refine((v) => v.revoked || v.fileIds, 'Возврат проверки — только по отмеченным документам');
export type RevokeDto = z.infer<typeof revokeSchema>;

export const resendSchema = z.object({
  fileIds: z
    .array(fileId)
    .min(1, 'Не отмечено ни одного документа')
    .max(RESEND_MAX_FILES, `За раз переотправляем не больше ${RESEND_MAX_FILES} писем`),
});
export type ResendDto = z.infer<typeof resendSchema>;

export const reissueSchema = z.object({
  fileIds: z
    .array(fileId)
    .min(1, 'Не отмечено ни одного документа')
    .max(BULK_MAX_FILES, `За раз можно перевыпустить не больше ${BULK_MAX_FILES} документов`),
});
export type ReissueDto = z.infer<typeof reissueSchema>;

/**
 * Разбор списка идентификаторов из строки запроса.
 *
 * Мусор молча отбрасываем, а не отвечаем ошибкой: ссылку на архив человек
 * мог сохранить в закладки, и одна протухшая позиция не повод отказать
 * в скачивании остальных.
 */
export function parseIds(raw: string | undefined): string[] {
  if (!raw) return [];
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return [...new Set(raw.split(',').map((s) => s.trim()))]
    .filter((s) => uuid.test(s))
    .slice(0, BULK_MAX_FILES);
}
