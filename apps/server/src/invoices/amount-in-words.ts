/**
 * Сумма прописью для счёта.
 *
 * В российском счёте это обязательная строка, и бухгалтер читает её первой:
 * ошибка здесь заметна сразу и подрывает доверие ко всему документу.
 *
 * Само число словами и согласование живут в `@gramota/shared`
 * (`number-in-words.ts`): те же правила понадобились генерации
 * документов, и держать вторую копию таблицы числительных значило бы
 * однажды починить её только в одном из двух мест. Здесь остаётся то,
 * что специфично для денег: рубли мужского рода, копейки цифрами
 * и запрет дробных сумм.
 */

import { capitalizeFirst, numberInWords, plural } from '@gramota/shared';

/** Выбор формы по последним двум цифрам: 1 → «рубль», 2–4 → «рубля», иначе «рублей». */
export { plural };

/**
 * Сумма в копейках → «Шестьдесят девять тысяч рублей 00 копеек».
 * Копейки цифрами: так принято в счетах и так их проще сверять.
 */
export function amountInWords(kopecks: number): string {
  if (!Number.isInteger(kopecks) || kopecks < 0) {
    throw new Error('Сумма должна быть целым числом копеек, не меньше нуля');
  }

  const rubles = Math.floor(kopecks / 100);
  const cents = kopecks % 100;

  const capitalized = capitalizeFirst(numberInWords(rubles));

  return `${capitalized} ${plural(rubles, 'рубль', 'рубля', 'рублей')} ${String(cents).padStart(2, '0')} ${plural(cents, 'копейка', 'копейки', 'копеек')}`;
}
