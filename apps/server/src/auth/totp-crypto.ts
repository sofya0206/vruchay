import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto';

/**
 * Секрет TOTP в базе лежит зашифрованным: он равносилен второму паролю,
 * и утечка базы не должна отдавать его в открытом виде. AES-256-GCM
 * с ключом из TOTP_SECRET_KEY (см. config/env.ts). Формат строки —
 * `v1.<iv>.<tag>.<шифртекст>` в base64url, чтобы однажды сменить
 * алгоритм, не переписывая всех.
 */

const VERSION = 'v1';

function deriveKey(secretKey: string): Buffer {
  return createHash('sha256').update(secretKey).digest();
}

export function encryptTotpSecret(plain: string, secretKey: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(secretKey), iv);
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString('base64url'),
    tag.toString('base64url'),
    body.toString('base64url'),
  ].join('.');
}

export function decryptTotpSecret(stored: string, secretKey: string): string {
  const [version, iv, tag, body] = stored.split('.');
  if (version !== VERSION || !iv || !tag || !body) {
    throw new Error('Секрет второго фактора записан в неизвестном формате');
  }
  const decipher = createDecipheriv(
    'aes-256-gcm',
    deriveKey(secretKey),
    Buffer.from(iv, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(body, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

/**
 * Хеш резервного кода — HMAC с серверным ключом, а не голый SHA-256:
 * у кода 50 бит энтропии, и без ключа его перебрали бы по утёкшей базе.
 */
export function hashBackupCode(normalizedCode: string, secretKey: string): string {
  return createHmac('sha256', deriveKey(secretKey)).update(normalizedCode).digest('hex');
}
