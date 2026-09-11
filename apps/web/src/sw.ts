/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';

declare const self: ServiceWorkerGlobalScope;

/**
 * Свой service worker, а не сгенерированный: нам нужен не только кэш оболочки,
 * но и место, куда позже встанет обработка push-уведомлений.
 *
 * Осознанно кэшируем только саму оболочку приложения. Запросы к API всегда идут
 * в сеть: показать секретарю организации устаревший список получателей или
 * застывший прогресс генерации — хуже, чем честно показать ошибку сети.
 */

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

self.addEventListener('install', () => {
  // Новая версия начинает работать сразу: приложение внутреннее,
  // держать пользователя на старой сборке до закрытия всех вкладок незачем.
  void self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

/**
 * Push-уведомления о завершении генерации и рассылки.
 * Содержимое приходит с сервера уже без персональных данных: тело push
 * проходит через сторонний сервис доставки и уходит за пределы нашего контура.
 */
self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload: { title?: string; body?: string; url?: string } = {};
  try {
    payload = event.data.json() as typeof payload;
  } catch {
    payload = { body: event.data.text() };
  }

  event.waitUntil(
    self.registration.showNotification(payload.title ?? 'Вручай', {
      body: payload.body ?? '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: payload.url ?? '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data as { url?: string } | undefined)?.url ?? '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Если приложение уже открыто — переводим фокус на него,
      // а не плодим вкладки при каждом уведомлении.
      for (const client of clients) {
        if ('focus' in client) {
          void client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
