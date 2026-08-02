/**
 * Сумма прописью для счёта.
 *
 * В российском счёте это обязательная строка, и бухгалтер читает её первой:
 * ошибка здесь заметна сразу и подрывает доверие ко всему документу.
 *
 * Две ловушки русского счёта, из-за которых готовые библиотеки часто врут:
 * тысяча женского рода («одна тысяча», не «один»), а рубль мужского;
 * и склонение зависит от последних двух цифр, а не от последней
 * («одиннадцать рублей», не «одиннадцать рубль»).
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

/** Выбор формы по последним двум цифрам: 1 → «рубль», 2–4 → «рубля», иначе «рублей». */
export function plural(n: number, one: string, few: string, many: string): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return many;
  const mod10 = n % 10;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

/** Группа до 999 словами. Род задаётся отдельно: тысячи женского, рубли мужского. */
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
 * Сумма в копейках → «Шестьдесят девять тысяч рублей 00 копеек».
 * Копейки цифрами: так принято в счетах и так их проще сверять.
 */
export function amountInWords(kopecks: number): string {
  if (!Number.isInteger(kopecks) || kopecks < 0) {
    throw new Error('Сумма должна быть целым числом копеек, не меньше нуля');
  }

  const rubles = Math.floor(kopecks / 100);
  const cents = kopecks % 100;

  const words: string[] = [];
  const millions = Math.floor(rubles / 1_000_000);
  const thousands = Math.floor((rubles % 1_000_000) / 1000);
  const units = rubles % 1000;

  if (millions) {
    words.push(...groupToWords(millions, false));
    words.push(plural(millions, 'миллион', 'миллиона', 'миллионов'));
  }
  if (thousands) {
    words.push(...groupToWords(thousands, true));
    words.push(plural(thousands, 'тысяча', 'тысячи', 'тысяч'));
  }
  if (units) words.push(...groupToWords(units, false));
  if (words.length === 0) words.push('ноль');

  const text = words.join(' ');
  const capitalized = text.charAt(0).toUpperCase() + text.slice(1);

  return `${capitalized} ${plural(rubles, 'рубль', 'рубля', 'рублей')} ${String(cents).padStart(2, '0')} ${plural(cents, 'копейка', 'копейки', 'копеек')}`;
}
