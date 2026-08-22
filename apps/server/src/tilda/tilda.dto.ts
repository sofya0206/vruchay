import { z } from 'zod';

/**
 * Поля формы Тильды. Имена совпадают с переменными документа, поэтому
 * ограничены тем же набором символов. Значения — короткие строки: сюда
 * приходит имя и, возможно, пара уточнений, а не произвольные данные.
 */
const fieldName = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]*$/).max(64);

export const submitSchema = z.object({
  token: z.string().uuid('Некорректный токен интеграции'),
  documentId: z.string().uuid('Некорректный идентификатор документа'),
  email: z.string().trim().toLowerCase().email('Проверьте адрес электронной почты').max(254),
  /**
   * Адрес учётной записи на площадке — подставляется личным кабинетом,
   * человек его не набирает. По нему держится «один документ в руки»
   * даже если адрес доставки разрешено менять.
   *
   * Некорректное значение отбрасываем, а не отвергаем заявку целиком:
   * поле служебное, человек о нём не знает, и отказывать ему из-за того,
   * что площадка прислала мусор, было бы наказанием не по адресу.
   */
  accountEmail: z
    .string()
    .trim()
    .toLowerCase()
    .max(254)
    .optional()
    .transform((v) => (v && z.string().email().safeParse(v).success ? v : undefined)),
  fields: z.record(fieldName, z.string().max(500)).default({}),
  /**
   * Согласие на обработку — обязательное. Форма без отмеченной галочки
   * не должна доходить до сервера, но проверяем и здесь: клиентские
   * проверки обходятся.
   */
  consent: z.literal(true, { message: 'Требуется согласие на обработку персональных данных' }),
  /** Согласие на рассылку — строго необязательное, услуга от него не зависит. */
  consentMarketing: z.boolean().default(false),
  /** Отпечаток текста согласия, который видел человек. */
  consentVersion: z.string().max(128).default('unknown'),
  /**
   * Поле-ловушка: настоящий человек его не видит и не заполняет.
   * Заполнено — почти наверняка автоматическая отправка.
   */
  website: z.string().max(200).optional(),
});
export type SubmitDto = z.infer<typeof submitSchema>;

export const confirmSchema = z.object({
  requestId: z.string().uuid(),
  code: z.string().trim().regex(/^\d{6}$/, 'Код состоит из шести цифр'),
});
export type ConfirmDto = z.infer<typeof confirmSchema>;

/** Настройки интеграции, которые задаёт клиент в личном кабинете. */
export const integrationSchema = z.object({
  name: z.string().trim().min(1, 'Введите название').max(100),
  allowedDomains: z
    .array(z.string().trim().min(3).max(253))
    .min(1, 'Укажите хотя бы один домен, иначе форма не будет работать')
    .max(20),
  documentIds: z.array(z.string().uuid()).min(1, 'Выберите хотя бы один документ').max(50),
  authMode: z.enum(['none', 'email_code']).default('email_code'),
  /** Сверять адрес с реестром получателей документа до всего остального. */
  checkList: z.boolean().default(false),
  /** Принимать заявку только изнутри личного кабинета площадки. */
  requireAccount: z.boolean().default(false),
  singleFilePerEmail: z.boolean().default(true),
  dailyLimit: z.coerce.number().int().min(1).max(10_000).default(500),
  successMessage: z.string().trim().max(300).default('Спасибо! Документ отправлен на вашу почту'),
  showDownload: z.boolean().default(true),
  sendEmail: z.boolean().default(true),
  copyToEmail: z.string().trim().email().max(254).or(z.literal('')).optional(),
  active: z.boolean().default(true),
});
export type IntegrationDto = z.infer<typeof integrationSchema>;
