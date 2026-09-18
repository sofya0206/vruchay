import { z } from 'zod';

/**
 * Границы раздела рассылки.
 *
 * Схема транзакционного письма закрыта на лишние поля намеренно: попытка
 * передать рекламодателя вместе с письмом о выдаче документа не «молча
 * игнорируется», а отклоняется на входе. Это первая из трёх преград между
 * рекламой и транзакционным письмом; вторая — выбор шаблона по потоку
 * в запросе к базе, третья — сборка тела письма (см. letter-kind.ts).
 */

export const letterKindSchema = z.enum(['transactional', 'marketing']);

const letterFields = {
  subject: z.string().trim().min(1, 'Введите тему письма').max(300),
  bodyHtml: z.string().max(50_000),
  attachGeneratedFile: z.boolean().default(true),
  senderId: z.string().uuid().optional(),
};

export const templateSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('transactional'),
    ...letterFields,
  }),
  z.strictObject({
    kind: z.literal('marketing'),
    ...letterFields,
    advertiserName: z
      .string()
      .trim()
      .min(1, 'Укажите рекламодателя: получатель должен видеть, чья это реклама')
      .max(200),
  }),
]);

export type TemplateDto = z.infer<typeof templateSchema>;

/**
 * Отправка.
 *
 * Материалов может быть несколько — по письму на каждый: в день награждения
 * рассылают и грамоты, и сертификаты участника, и разбивать это на два
 * захода незачем. Двадцати хватает: больше — это уже не «выбрал материалы»,
 * а «отправил всё подряд».
 */
export const sendSchema = z
  .strictObject({
    documentIds: z
      .array(z.string().uuid())
      .min(1, 'Выберите хотя бы один материал')
      .max(20, 'За раз можно разослать не больше двадцати материалов'),
    kind: letterKindSchema,
    source: z.enum(['table', 'manual']),
    /** Список адресов целиком строкой: человек вставляет его как есть. */
    emails: z.string().max(60_000).optional(),
  })
  .refine((v) => v.source !== 'manual' || Boolean(v.emails?.trim()), {
    message: 'Укажите хотя бы один адрес',
    path: ['emails'],
  });

export type SendDto = z.infer<typeof sendSchema>;

export const testSendSchema = z.strictObject({
  documentId: z.string().uuid(),
  kind: letterKindSchema,
});

export const resendSchema = z.strictObject({
  documentId: z.string().uuid(),
});

export const logQuerySchema = z.strictObject({
  documentId: z.string().uuid().optional(),
  /** Адрес, тема, материал или рассылка — что человек помнит. */
  search: z.string().trim().max(200).optional(),
  /** Только недоставленные — с этого начинают разбор жалоб. */
  problemsOnly: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

/**
 * Рассылка без документа: текст списку адресов.
 *
 * Вложения нет по определению — поле attachGeneratedFile сюда не пускаем,
 * а не выставляем в false молча: лишнее поле означает, что клиент
 * думает о другой рассылке, и об этом лучше узнать на входе.
 */
const textLetterFields = {
  name: z.string().trim().min(1, 'Назовите рассылку').max(200),
  subject: letterFields.subject,
  bodyHtml: z.string().trim().min(1, 'Напишите текст письма').max(50_000),
  senderId: letterFields.senderId,
};

export const textMailingSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('transactional'), ...textLetterFields }),
  z.strictObject({
    kind: z.literal('marketing'),
    ...textLetterFields,
    advertiserName: templateSchema.options[1].shape.advertiserName,
  }),
]);

export type TextMailingDto = z.infer<typeof textMailingSchema>;

export const textRecipientsSchema = z.strictObject({
  /** Список адресов целиком строкой: человек вставляет его как есть. */
  emails: z.string().trim().min(1, 'Укажите хотя бы один адрес').max(60_000),
});

const isoDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Дата в виде ГГГГ-ММ-ДД')
  // Круг через Date: «2026-02-31» Date.parse принимает и тихо превращает в март.
  .refine((v) => {
    const time = Date.parse(v);
    return !Number.isNaN(time) && new Date(time).toISOString().slice(0, 10) === v;
  }, 'Такой даты нет');

export const statsQuerySchema = z.strictObject({
  from: isoDay.optional(),
  to: isoDay.optional(),
});
