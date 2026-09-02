import { createHmac, timingSafeEqual, createHash } from 'node:crypto';

/**
 * Одноразовый токен для страницы рендера.
 *
 * Воркер печатает PDF, открывая обычную страницу приложения в браузере без сессии,
 * поэтому доступ к данным строки даёт сам токен. Отсюда требования: он подписан,
 * живёт минуты и разрешает ровно одну строку одного задания — компрометация
 * такого токена не открывает ни соседние строки, ни чужую организацию.
 */

export interface RenderTokenPayload {
  jobId: string;
  rowId: string;
  /**
   * Идентификатор будущего экземпляра документа, выделенный до печати.
   *
   * Нужен, чтобы QR на грамоте вёл на проверку именно этого экземпляра.
   * Файл создаётся уже после отрисовки, поэтому взять идентификатор
   * из него в момент печати невозможно — его выделяет воркер заранее
   * и передаёт сюда, а потом записывает в тот же файл.
   */
  publicId?: string;
  /**
   * Короткий публичный код того же экземпляра — тот, что печатается
   * на бумаге и кодируется в QR (см. verify/public-code.ts). Выделяется
   * там же и тогда же, что и publicId, по той же причине.
   */
  code?: string;
  /** Unix-время истечения, в секундах. */
  exp: number;
}

export const RENDER_TOKEN_TTL_SECONDS = 10 * 60;

/** Отдельный ключ, чтобы подпись токена не пересекалась с ключом сессии. */
function keyFrom(secret: string): Uint8Array {
  return new Uint8Array(createHash('sha256').update(`${secret}:render`).digest());
}

function sign(data: string, secret: string): string {
  return createHmac('sha256', keyFrom(secret)).update(data).digest('base64url');
}

export function createRenderToken(
  payload: Omit<RenderTokenPayload, 'exp'>,
  secret: string,
  nowSeconds: number,
): string {
  const body: RenderTokenPayload = { ...payload, exp: nowSeconds + RENDER_TOKEN_TTL_SECONDS };
  const data = Buffer.from(JSON.stringify(body), 'utf8').toString('base64url');
  return `${data}.${sign(data, secret)}`;
}

/** Возвращает разобранные данные или null: причину наружу не сообщаем. */
export function verifyRenderToken(
  token: string,
  secret: string,
  nowSeconds: number,
): RenderTokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [data, signature] = parts;

  const expected = new Uint8Array(Buffer.from(sign(data, secret)));
  const received = new Uint8Array(Buffer.from(signature));
  // Сравнение постоянного времени: иначе подпись можно подобрать побайтово.
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;

  let payload: RenderTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8')) as RenderTokenPayload;
  } catch {
    return null;
  }

  if (typeof payload.jobId !== 'string' || typeof payload.rowId !== 'string') return null;
  if (payload.publicId !== undefined && typeof payload.publicId !== 'string') return null;
  if (payload.code !== undefined && typeof payload.code !== 'string') return null;
  if (typeof payload.exp !== 'number' || payload.exp <= nowSeconds) return null;
  return payload;
}
