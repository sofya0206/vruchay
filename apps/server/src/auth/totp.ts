import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Одноразовые коды по времени (RFC 6238) поверх HOTP (RFC 4226).
 *
 * Своя реализация на node:crypto, а не библиотека: алгоритм умещается
 * в тридцать строк, а каждая зависимость в контуре входа — это ещё один
 * пакет, за обновлениями которого надо следить. Параметры — те, что
 * понимают Google Authenticator, Яндекс Ключ и остальные: SHA-1,
 * шесть цифр, шаг тридцать секунд.
 */

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const TOTP_STEP_SECONDS = 30;
export const TOTP_DIGITS = 6;

/** Base32 без дополнения «=»: приложения-аутентификаторы ждут именно так. */
export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  const clean = text.toUpperCase().replace(/[=\s-]/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error('Секрет содержит недопустимые символы');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** Двадцать случайных байт — 160 бит, как рекомендует RFC 4226. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function hotp(secret: Buffer, counter: bigint, digits = TOTP_DIGITS): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(counter);
  const digest = createHmac('sha1', secret).update(message).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return String(binary % 10 ** digits).padStart(digits, '0');
}

export function totp(secretBase32: string, atSeconds: number, digits = TOTP_DIGITS): string {
  const counter = BigInt(Math.floor(atSeconds / TOTP_STEP_SECONDS));
  return hotp(base32Decode(secretBase32), counter, digits);
}

/**
 * Сверка кода с допуском в один шаг в обе стороны: часы телефона и сервера
 * расходятся, а человек набирает код не мгновенно. Возвращает номер шага,
 * которым код подошёл, — чтобы один и тот же код нельзя было предъявить
 * дважды, — либо null.
 */
export function verifyTotp(
  secretBase32: string,
  code: string,
  atSeconds: number,
  window = 1,
): bigint | null {
  const normalized = code.replace(/\s/g, '');
  if (!/^\d{6}$/.test(normalized)) return null;

  const secret = base32Decode(secretBase32);
  const current = BigInt(Math.floor(atSeconds / TOTP_STEP_SECONDS));
  for (let delta = -window; delta <= window; delta++) {
    const counter = current + BigInt(delta);
    if (counter < 0n) continue;
    const expected = hotp(secret, counter);
    if (timingSafeEqual(Buffer.from(expected), Buffer.from(normalized))) return counter;
  }
  return null;
}

/** Ссылка для QR-кода: её понимает любое приложение-аутентификатор. */
export function otpauthUrl(params: { secret: string; account: string; issuer: string }): string {
  const label = encodeURIComponent(`${params.issuer}:${params.account}`);
  const query = new URLSearchParams({
    secret: params.secret,
    issuer: params.issuer,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${query.toString()}`;
}

/**
 * Резервные коды: десять штук по десять знаков из алфавита без похожих
 * символов (нет 0/O, 1/I/L). 32 знака в десяти позициях — 50 бит, этого
 * хватает и от перебора через форму (она под ограничением частоты),
 * и от перебора по утёкшим хешам (они с серверным ключом).
 */
const BACKUP_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const BACKUP_CODES_COUNT = 10;
const BACKUP_CODE_LENGTH = 10;

export function generateBackupCodes(count = BACKUP_CODES_COUNT): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const bytes = randomBytes(BACKUP_CODE_LENGTH);
    let code = '';
    for (let j = 0; j < BACKUP_CODE_LENGTH; j++) {
      code += BACKUP_ALPHABET[bytes[j] % BACKUP_ALPHABET.length];
    }
    // Дефис посередине: человек переписывает код с бумажки, и пять
    // на пять читаются надёжнее, чем десять подряд.
    codes.push(`${code.slice(0, 5)}-${code.slice(5)}`);
  }
  return codes;
}

/** Код с бумажки в канонический вид: без дефисов, пробелов и регистра. */
export function normalizeBackupCode(code: string): string {
  return code.toUpperCase().replace(/[\s-]/g, '');
}
