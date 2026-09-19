import { z } from 'zod';

/**
 * Push-сервисы браузеров, которым сервер соглашается слать уведомления.
 *
 * Адрес подписки присылает браузер, а сервер потом сам делает по нему
 * запрос. Прими мы любой адрес — это был бы готовый способ заставить
 * сервер стучаться во внутреннюю сеть (SSRF): подписка на
 * `http://10.0.0.5/admin` выглядела бы как обычная. Поэтому только HTTPS
 * и только хосты известных сервисов доставки.
 *
 * Chrome, Edge на Android, Samsung Internet, Opera и Яндекс Браузер
 * на Android ходят через FCM; Firefox — через Mozilla; Safari — через
 * Apple; Edge на Windows — через WNS. Отказанный хост сервер пишет
 * в журнал (только хост, без адреса целиком) — по нему список и дополняют.
 */
const EXACT_HOSTS = new Set([
  'fcm.googleapis.com',
  'android.googleapis.com',
  'updates.push.services.mozilla.com',
  'push.services.mozilla.com',
  'web.push.apple.com',
]);
const HOST_SUFFIXES = ['.push.apple.com', '.notify.windows.com'];

export function isAllowedPushEndpoint(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return false;
  const host = url.hostname.toLowerCase();
  return EXACT_HOSTS.has(host) || HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

/** Ключи подписки — base64url без выравнивания, как их отдаёт `PushSubscription.toJSON()`. */
const base64url = z.string().regex(/^[A-Za-z0-9_-]+={0,2}$/, 'Ключ подписки в неверном формате');

export const subscribeSchema = z.object({
  endpoint: z.string().url().max(1024),
  keys: z.object({
    // Открытый ключ P-256 — 65 байт, в base64url 87 знаков; с запасом.
    p256dh: base64url.min(80).max(128),
    // Секрет — 16 байт, 22 знака.
    auth: base64url.min(16).max(64),
  }),
});
export type SubscribeInput = z.infer<typeof subscribeSchema>;

export const unsubscribeSchema = z.object({ endpoint: z.string().url().max(1024) });
