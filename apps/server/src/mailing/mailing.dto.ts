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
  /** Только недоставленные — с этого начинают разбор жалоб. */
  problemsOnly: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});
