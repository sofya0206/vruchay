/**
 * Числительные прописью: 21 → «двадцать один».
 *
 * Модуль появился не на пустом месте: сумма прописью для счетов
 * (`apps/server/src/invoices/amount-in-words.ts`) уже считалась по этим
 * же правилам, только внутри денежного кода и без выхода наружу.
 * Здесь общая часть — числа и согласование, — а рубли с копейками
 * остались там, где им и место.
 *
 * Две ловушки русского счёта, из-за которых готовые библиотеки врут:
 * тысяча женского рода («одна тысяча», не «один»), а рубль и час —
 * мужского; и форма слова зависит от последних двух цифр, а не от
 * последней («одиннадцать часов», не «одиннадцать час»).
 */

const ONES_MALE = ['', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];
const ONES_FEMALE = ['', 'одна', 'две', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];
const TEENS = [
  'десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать',
  'пятнадцать', 'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать',
];
const TENS = [
  '', '', 'двадцать', 'тридцать', 'сорок', 'пятьдесят',
  'шестьдесят', 'семьдесят', 'восемьдесят', 'девяносто',
];
const HUNDREDS = [
  '', 'сто', 'двести', 'триста', 'четыреста', 'пятьсот',
  'шестьсот', 'семьсот', 'восемьсот', 'девятьсот',
];

/** Род последней группы. Тысячи и миллионы свой род задают сами. */
export type NumberGender = 'male' | 'female';

/**
 * Выбор формы по последним двум цифрам: 1 → «час», 2–4 → «часа»,
 * иначе «часов».
 */
export function plural(n: number, one: string, few: string, many: string): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return many;
  const mod10 = n % 10;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

/** Группа до 999 словами. Род задаётся снаружи: тысячи женского, часы мужского. */
function groupToWords(n: number, female: boolean): string[] {
  const parts: string[] = [];
  const h = Math.floor(n / 100);
  const rest = n % 100;
  if (h) parts.push(HUNDREDS[h]);
  if (rest >= 10 && rest <= 19) {
    parts.push(TEENS[rest - 10]);
  } else {
    const t = Math.floor(rest / 10);
    const o = rest % 10;
    if (t) parts.push(TENS[t]);
    if (o) parts.push(female ? ONES_FEMALE[o] : ONES_MALE[o]);
  }
  return parts;
}

/**
 * Целое число словами: 21 → «двадцать один», 1000 → «одна тысяча».
 *
 * `gender` относится только к последней группе — к самому предмету
 * счёта: «двадцать один рубль», но «двадцать одна копейка». У тысяч
 * и миллионов род свой и неизменный, его выбирать не приходится.
 *
 * Дробные и отрицательные отвергаем исключением, а не молчаливым
 * округлением: в документе «минус полтора» словами не пишут, и лучше
 * упасть на сборке счёта, чем напечатать неправду.
 */
export function numberInWords(n: number, gender: NumberGender = 'male'): string {
  if (!Number.isInteger(n) || n < 0) {
    throw new Error('Число должно быть целым и не меньше нуля');
  }

  const words: string[] = [];
  const billions = Math.floor(n / 1_000_000_000);
  const millions = Math.floor((n % 1_000_000_000) / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1000);
  const units = n % 1000;

  if (billions) {
    words.push(...groupToWords(billions, false));
    words.push(plural(billions, 'миллиард', 'миллиарда', 'миллиардов'));
  }
  if (millions) {
    words.push(...groupToWords(millions, false));
    words.push(plural(millions, 'миллион', 'миллиона', 'миллионов'));
  }
  if (thousands) {
    words.push(...groupToWords(thousands, true));
    words.push(plural(thousands, 'тысяча', 'тысячи', 'тысяч'));
  }
  if (units) words.push(...groupToWords(units, gender === 'female'));
  if (words.length === 0) words.push('ноль');

  return words.join(' ');
}

/**
 * Число словами вместе с согласованным словом: «двадцать один документ»,
 * «двадцать два документа», «двадцать пять документов».
 *
 * Согласование и запись прописью почти всегда нужны вместе — «двадцать
 * один часов» портит документ ровно так же, как «21 час» вместо
 * прописи, — поэтому отдельная функция, а не два вызова подряд
 * на стороне вызывающего.
 */
export function numberInWordsWith(
  n: number,
  one: string,
  few: string,
  many: string,
  gender: NumberGender = 'male',
): string {
  return `${numberInWords(n, gender)} ${plural(n, one, few, many)}`;
}

/** Первая буква заглавной — для строки, с которой начинается абзац документа. */
export function capitalizeFirst(text: string): string {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}
