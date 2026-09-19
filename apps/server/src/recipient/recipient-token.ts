import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Подписанная ссылка получателя на его документ: `/d/<token>`.
 *
 * Отдельный путь от проверки по QR намеренно. Страница проверки открыта
 * всем и потому не отдаёт PDF — файл содержит полное имя даже тогда, когда
 * эмитент показывает на странице только инициалы. Ссылка из письма знает
 * только сам получатель, и ей PDF отдать можно.
 *
 * Токен — идентификатор файла и срок, подписанные HMAC от ключа,
 * выведенного из SESSION_SECRET. В базе ничего не хранится: сменился
 * секрет — ссылки в старых письмах перестают работать, и это допустимо,
 * документ всё равно лежит вложением в том же письме.
 */
export interface RecipientTokenPayload {
  fileId: string;
  exp: number;
}

/** Месяц: письмо открывают в день награждения, а пересылают друзьям — неделями. */
export const RECIPIENT_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

function keyFrom(secret: string): Uint8Array {
  return new Uint8Array(createHash('sha256').update(`${secret}:recipient`).digest());
}

function sign(body: string, secret: string): string {
  return createHmac('sha256', keyFrom(secret)).update(body).digest('base64url');
}

export function signRecipientToken(secret: string, fileId: string, now = Date.now()): string {
  const payload: RecipientTokenPayload = { fileId, exp: Math.floor(now / 1000) + RECIPIENT_TOKEN_TTL_SECONDS };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${sign(body, secret)}`;
}

/** Разбор и проверка. `null` — подделка или мусор; просроченный — `{ expired: true }`. */
export function verifyRecipientToken(
  secret: string,
  token: string,
  now = Date.now(),
): { payload: RecipientTokenPayload; expired: boolean } | null {
  const [body, signature] = token.split('.');
  if (!body || !signature || token.length > 512) return null;
  const expected = Buffer.from(sign(body, secret));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as RecipientTokenPayload;
    if (typeof payload.fileId !== 'string' || typeof payload.exp !== 'number') return null;
    return { payload, expired: payload.exp * 1000 < now };
  } catch {
    return null;
  }
}
