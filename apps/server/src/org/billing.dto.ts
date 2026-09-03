import { z } from 'zod';

/**
 * Реквизиты плательщика.
 *
 * Четыре вида платят по-разному, и проверка у каждого своя: у юрлица
 * ИНН из десяти цифр и есть КПП, у предпринимателя и самозанятого — из
 * двенадцати и КПП не бывает. Проверяем это здесь, а не подсказкой в
 * поле: неверный ИНН в счёте бухгалтерия покупателя не проведёт.
 */
export const BILLING_KINDS = ['legal', 'ie', 'self_employed', 'individual'] as const;
export type BillingKind = (typeof BILLING_KINDS)[number];

export const BILLING_KIND_TITLE: Record<BillingKind, string> = {
  legal: 'Юридическое лицо',
  ie: 'Индивидуальный предприниматель',
  self_employed: 'Самозанятый',
  individual: 'Физическое лицо',
};

const digits = (length: number, message: string) =>
  z
    .string()
    .trim()
    .refine((v) => v === '' || new RegExp(`^\\d{${length}}$`).test(v), message);

export const billingSchema = z
  .object({
    kind: z.enum(BILLING_KINDS),
    name: z.string().trim().min(2, 'Укажите название или ФИО').max(300),
    inn: z.string().trim().max(12),
    kpp: digits(9, 'КПП состоит из девяти цифр'),
    ogrn: z.string().trim().max(15),
    address: z.string().trim().max(500),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .max(254)
      .refine((v) => v === '' || z.string().email().safeParse(v).success, 'Некорректный адрес'),
  })
  .superRefine((dto, ctx) => {
    const innLength = dto.kind === 'legal' ? 10 : 12;
    // У физлица ИНН не обязателен: счёт ему выставляют и без него.
    const innRequired = dto.kind !== 'individual';

    if (dto.inn === '') {
      if (innRequired)
        ctx.addIssue({ code: 'custom', path: ['inn'], message: 'Без ИНН счёт не выставить' });
    } else if (!new RegExp(`^\\d{${innLength}}$`).test(dto.inn)) {
      ctx.addIssue({
        code: 'custom',
        path: ['inn'],
        message: `ИНН ${dto.kind === 'legal' ? 'организации' : 'человека'} состоит из ${innLength} цифр`,
      });
    }

    if (dto.kpp !== '' && dto.kind !== 'legal') {
      ctx.addIssue({ code: 'custom', path: ['kpp'], message: 'КПП бывает только у организации' });
    }

    if (dto.ogrn !== '') {
      const ogrnLength = dto.kind === 'legal' ? 13 : 15;
      if (dto.kind === 'self_employed' || dto.kind === 'individual') {
        ctx.addIssue({
          code: 'custom',
          path: ['ogrn'],
          message: 'ОГРН бывает у организации и предпринимателя',
        });
      } else if (!new RegExp(`^\\d{${ogrnLength}}$`).test(dto.ogrn)) {
        ctx.addIssue({
          code: 'custom',
          path: ['ogrn'],
          message: `${dto.kind === 'legal' ? 'ОГРН' : 'ОГРНИП'} состоит из ${ogrnLength} цифр`,
        });
      }
    }
  });

export type BillingDto = z.infer<typeof billingSchema>;
