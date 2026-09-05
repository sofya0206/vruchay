import { z } from 'zod';
import { CALL_TIMES, EVENT_KINDS, VOLUME_BANDS, type LeadRequest } from '@gramota/shared';

/**
 * Заявка с посадочной страницы.
 *
 * Обязательных полей ровно четыре: как называется организация, как обращаться,
 * куда ответить и согласие на обработку данных. Всё остальное необязательно —
 * каждое лишнее обязательное поле стоит части заявок, а недостающее спросим
 * в разговоре.
 *
 * Справочники (объём, тип мероприятий, время звонка) приходят значениями
 * из `@gramota/shared` и проверяются по белому списку: свободный текст здесь
 * не нужен, а список общий с формой — чтобы правильный ответ не получал отказ.
 */
export const leadSchema = z.object({
  orgName: z.string().trim().min(2, 'Укажите название организации').max(200),
  contact: z.string().trim().min(2, 'Как к вам обращаться?').max(120),
  email: z.string().trim().toLowerCase().email('Проверьте адрес электронной почты').max(254),
  phone: z.string().trim().max(40).optional(),
  /** ИНН: 10 знаков у организации, 12 у предпринимателя. */
  inn: z.string().trim().regex(/^\d{10}$|^\d{12}$/, 'ИНН состоит из 10 или 12 цифр').optional(),
  /** Тариф с уже согласованной ценой. Публичная форма его не присылает. */
  tariff: z.string().trim().max(60).optional(),
  /** Объём документов в год — диапазоном: точного числа не знает никто. */
  volume: z.enum(VOLUME_BANDS).optional(),
  /** Тип мероприятий: по нему видно, какие документы нужны и когда пики. */
  eventKinds: z.array(z.enum(EVENT_KINDS)).max(EVENT_KINDS.length).optional(),
  callTime: z.enum(CALL_TIMES).optional(),
  comment: z.string().trim().max(2000).optional(),
  /**
   * Согласие на обработку данных. Без него заявку принимать нельзя:
   * в ней имя, телефон и почта живого человека, и обрабатываем мы их
   * не по договору, а по его согласию.
   */
  consent: z.literal(true, 'Без согласия на обработку данных заявку принять нельзя'),
  /** Поле-ловушка: человек его не видит и не заполняет. */
  website: z.string().max(200).optional(),
});

export type LeadDto = z.infer<typeof leadSchema>;

/**
 * Схема обязана принимать то, что шлёт форма.
 *
 * Проверка выполняется при сборке: разъедься имена полей — встанет она,
 * а не приём заявок в проде. `inn` и `tariff` в форме не спрашивают,
 * они приходят только из заявок с уже согласованным тарифом.
 */
type FormFitsSchema = LeadRequest extends Omit<LeadDto, 'inn' | 'tariff'> ? true : never;
const formFitsSchema: FormFitsSchema = true;
void formFitsSchema;

export const leadStatusSchema = z.object({
  status: z.enum(['new', 'in_progress', 'won', 'lost']),
  note: z.string().trim().max(2000).optional(),
});
export type LeadStatusDto = z.infer<typeof leadStatusSchema>;
