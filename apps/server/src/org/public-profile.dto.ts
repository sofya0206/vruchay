import { z } from 'zod';

/**
 * Адрес публичной страницы: латиница, цифры и дефис, без служебных слов.
 *
 * Запрещённые значения — это пути, которые уже заняты приложением или
 * могут быть заняты: организация с адресом /org/api выглядела бы как
 * часть сервиса, а не как клиент.
 */
const RESERVED_SLUGS = new Set([
  'api',
  'org',
  'verify',
  'c',
  'login',
  'register',
  'settings',
  'admin',
  'vruchay',
  'support',
  'help',
  'about',
  'privacy',
  'search',
]);

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^[a-z0-9](?:[a-z0-9-]{1,48}[a-z0-9])?$/,
    'Адрес: латиница, цифры и дефис, от 3 до 50 знаков',
  )
  .refine((v) => !RESERVED_SLUGS.has(v), 'Этот адрес занят сервисом');

/** Пустая строка — «не указано»; иначе значение проверяется по форме. */
const optionalUrl = z
  .string()
  .trim()
  .max(300)
  .refine(
    (v) => v === '' || /^https?:\/\/[^\s]+$/i.test(v),
    'Ссылка должна начинаться с http:// или https://',
  );

const optionalEmail = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .refine((v) => v === '' || /^[^\s@]+@[^\s@.]+\.[^\s@]{2,}$/.test(v), 'Некорректный адрес почты');

/** ИНН: десять цифр у юрлица, двенадцать у ИП. Пусто — не указан. */
const optionalInn = z
  .string()
  .trim()
  .refine((v) => v === '' || /^\d{10}$|^\d{12}$/.test(v), 'ИНН — десять или двенадцать цифр');

export const updatePublicProfileSchema = z
  .object({
    slug: slugSchema.nullable(),
    description: z.string().trim().max(2000),
    inn: optionalInn,
    website: optionalUrl,
    contactEmail: optionalEmail,
    contactPhone: z.string().trim().max(40),
    publicPageEnabled: z.boolean(),
    /*
     * Поиск по ФИО. Включить можно только вместе с подтверждением, что
     * согласия субъектов на распространение собраны (ст. 10.1 152-ФЗ):
     * галочка без подтверждения — это наша соучастная вина в раскрытии.
     */
    publicSearchByName: z.boolean(),
    consentConfirmed: z.boolean().optional(),
    publicIndexable: z.boolean(),
    verifyNameMode: z.enum(['full', 'initials', 'none']),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Нечего обновлять')
  .refine(
    (v) => !v.publicSearchByName || v.consentConfirmed === true,
    'Поиск по ФИО включается только с подтверждением, что согласия участников собраны',
  );

export type UpdatePublicProfileDto = z.infer<typeof updatePublicProfileSchema>;
