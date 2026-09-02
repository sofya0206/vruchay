import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Публичный код документа: `K7M2-9QXR-4TVB`.
 *
 * Это то, что печатается на бумаге и диктуется по телефону, — отсюда
 * и все его свойства. Алфавит Крокфорда (Base32 без I, L, O, U): буквы,
 * которые путают с цифрами, из него убраны, а при вводе `O` и `I`
 * всё равно принимаются как `0` и `1`. Двенадцать знаков делятся
 * дефисами на три группы по четыре — так код читается вслух и
 * переписывается без потери места.
 *
 * Первые восемь знаков случайны (40 бит), последние четыре — хвост
 * HMAC от первых восьми (20 бит). Хвост нужен для двух вещей: опечатка
 * при вводе с бумаги ловится до похода в базу и объясняется человеку
 * («похоже, ошибка в коде»), а наугад набранный код почти никогда не
 * выглядит настоящим — подобрать чужой документ перебором нельзя даже
 * без ограничения частоты, а с ним и подавно.
 *
 * Прежний идентификатор — UUID в `File.publicId` — остаётся: он уже
 * напечатан в QR на выданных документах, и ссылки на него обязаны
 * работать вечно. Новый код появляется у документов, выпущенных после
 * этой правки, и только он идёт в новые QR и на бумагу.
 */

/** Алфавит Крокфорда: цифры и латиница без I, L, O, U. */
export const CROCKFORD_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Случайная часть и хвост — в знаках алфавита. */
const RANDOM_CHARS = 8;
const TAIL_CHARS = 4;
export const PUBLIC_CODE_LENGTH = RANDOM_CHARS + TAIL_CHARS;

/** Как код выглядит на бумаге: три группы по четыре через дефис. */
const CODE_SHAPE = /^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/;

/**
 * Ключ для хвоста — отдельный от всего остального.
 *
 * Выводится из секрета хешем с собственной меткой, а не берётся как есть:
 * тот же секрет служит ключом сессии и подписи токена печати, и один ключ
 * на три разных назначения — это то, чего криптография просит не делать.
 */
function keyFrom(secret: string): Uint8Array {
  return new Uint8Array(createHash('sha256').update(`${secret}:public-code`).digest());
}

/** Хвост от случайной части: первые 20 бит HMAC, записанные четырьмя знаками. */
function tailFor(random: string, secret: string): string {
  const mac = createHmac('sha256', keyFrom(secret)).update(random).digest();
  // 20 бит = 4 знака по 5 бит. Берём их из первых трёх байтов.
  const bits = (mac[0] << 12) | (mac[1] << 4) | (mac[2] >> 4);
  let out = '';
  for (let i = TAIL_CHARS - 1; i >= 0; i--) {
    out += CROCKFORD_ALPHABET[(bits >> (i * 5)) & 31];
  }
  return out;
}

/** Двенадцать знаков без дефисов → вид для бумаги. */
export function formatPublicCode(raw: string): string {
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
}

/**
 * Новый код. Случайность — из `randomBytes`, а не из Math.random:
 * предсказуемая случайная часть сделала бы бессмысленным хвост.
 */
export function generatePublicCode(secret: string): string {
  const bytes = randomBytes(RANDOM_CHARS);
  let random = '';
  for (let i = 0; i < RANDOM_CHARS; i++) random += CROCKFORD_ALPHABET[bytes[i] & 31];
  return formatPublicCode(random + tailFor(random, secret));
}

/**
 * Приводит то, что набрал человек, к каноническому виду — или null.
 *
 * Принимаем щедро: строчные буквы, пробелы и дефисы в любых местах,
 * `O` вместо нуля, `I` и `L` вместо единицы. Код диктуют по телефону
 * и переписывают с бумаги, и отказать из-за регистра значило бы
 * отказать в проверке настоящего документа.
 */
export function normalizePublicCode(input: string): string | null {
  const cleaned = input
    .toUpperCase()
    .replace(/[\s-]+/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
  if (cleaned.length !== PUBLIC_CODE_LENGTH) return null;
  for (const ch of cleaned) if (!CROCKFORD_ALPHABET.includes(ch)) return null;
  return formatPublicCode(cleaned);
}

/** Похоже ли на код по форме — без проверки хвоста. */
export function looksLikePublicCode(value: string): boolean {
  return CODE_SHAPE.test(value);
}

/**
 * Сходится ли хвост с случайной частью.
 *
 * Сравнение постоянного времени — по привычке, а не по нужде: хвост
 * не секрет, он напечатан на бумаге. Но привычка дешевле рассуждений
 * о том, где она точно не нужна.
 */
export function hasValidTail(code: string, secret: string): boolean {
  if (!CODE_SHAPE.test(code)) return false;
  const raw = code.replace(/-/g, '');
  const expected = Buffer.from(tailFor(raw.slice(0, RANDOM_CHARS), secret));
  const actual = Buffer.from(raw.slice(RANDOM_CHARS));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/**
 * Пары знаков, которые путают при вводе с бумаги.
 *
 * Показываем их человеку, когда код не нашёлся: «0 и O, 1 и I» — обычная
 * причина, по которой настоящий документ выглядит несуществующим.
 */
export const CONFUSABLE_PAIRS: readonly (readonly [string, string])[] = [
  ['0', 'O'],
  ['1', 'I'],
  ['1', 'L'],
  ['5', 'S'],
  ['8', 'B'],
  ['2', 'Z'],
];
