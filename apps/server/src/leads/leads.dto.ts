import { z } from 'zod';

/**
 * Заявка с посадочной страницы.
 *
 * Обязательных полей ровно три: как называется организация, как обращаться
 * и куда ответить. Всё остальное необязательно — каждое лишнее обязательное
 * поле стоит части заявок, а недостающее спросим в ответном письме.
 */
export const leadSchema = z.object({
  orgName: z.string().trim().min(2, 'Укажите название организации').max(200),
  contact: z.string().trim().min(2, 'Как к вам обращаться?').max(120),
  email: z.string().trim().toLowerCase().email('Проверьте адрес электронной почты').max(254),
  phone: z.string().trim().max(40).optional(),
  volume: z.string().trim().max(120).optional(),
  comment: z.string().trim().max(2000).optional(),
  /** Поле-ловушка: человек его не видит и не заполняет. */
  website: z.string().max(200).optional(),
});

export type LeadDto = z.infer<typeof leadSchema>;

export const leadStatusSchema = z.object({
  status: z.enum(['new', 'in_progress', 'won', 'lost']),
  note: z.string().trim().max(2000).optional(),
});
export type LeadStatusDto = z.infer<typeof leadStatusSchema>;
