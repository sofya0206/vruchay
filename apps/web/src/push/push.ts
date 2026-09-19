import { api } from '../api/client';

/**
 * Push-уведомления о готовности выпуска на этом устройстве (ADR-0004).
 *
 * Состояние считается по месту, а не хранится: разрешение и подписка
 * живут в браузере, и человек может снять их в настройках системы
 * в любой момент — кабинет узнаёт об этом, только спросив заново.
 */
export type PushState =
  /** Браузер не умеет push (встроенный браузер Telegram, старый Android). */
  | 'unsupported'
  /** iPhone в обычной вкладке Safari: уведомления только после «На экран Домой». */
  | 'needs-install'
  /** На сервере не заданы ключи VAPID. */
  | 'server-off'
  /** Человек запретил уведомления — снова спросить нельзя, только в настройках. */
  | 'denied'
  | 'off'
  | 'on';

function supported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export function isIos(): boolean {
  // iPad с iPadOS 13+ представляется маком — узнаём его по касаниям.
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (/macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
}

export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as { standalone?: boolean }).standalone === true
  );
}

async function serverKey(): Promise<string | null> {
  const { publicKey } = await api.get<{ publicKey: string | null }>('/push/key');
  return publicKey;
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration();
  return (await registration?.pushManager.getSubscription()) ?? null;
}

export async function pushState(): Promise<PushState> {
  if (isIos() && !isStandalone()) return 'needs-install';
  if (!supported()) return 'unsupported';
  if (!(await serverKey())) return 'server-off';
  if (Notification.permission === 'denied') return 'denied';
  if (Notification.permission !== 'granted') return 'off';
  const subscription = await currentSubscription();
  if (!subscription) return 'off';
  // Сервер мог подписку забыть (сменили ключи, почистили базу) — напоминаем
  // о ней при каждой проверке: запрос дешёвый, а уведомления иначе молча
  // перестали бы приходить.
  await api.post('/push/subscribe', subscription.toJSON()).catch(() => undefined);
  return 'on';
}

/**
 * Включить уведомления. Вызывать только из нажатия: браузеры показывают
 * окно разрешения лишь в ответ на действие человека.
 */
export async function enablePush(): Promise<PushState> {
  const key = await serverKey();
  if (!key) return 'server-off';
  const permission = await Notification.requestPermission();
  if (permission === 'denied') return 'denied';
  if (permission !== 'granted') return 'off';
  const registration = await navigator.serviceWorker.ready;
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToBytes(key),
    }));
  await api.post('/push/subscribe', subscription.toJSON());
  return 'on';
}

export async function disablePush(): Promise<PushState> {
  const subscription = await currentSubscription();
  if (subscription) {
    await api.delete('/push/subscribe', { endpoint: subscription.endpoint }).catch(() => undefined);
    await subscription.unsubscribe();
  }
  return 'off';
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4);
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}
