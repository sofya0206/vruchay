/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches, matchPrecache } from 'workbox-precaching';

declare const self: ServiceWorkerGlobalScope;

/**
 * Свой service worker, а не сгенерированный: нам нужен не только кэш оболочки,
 * но и место, куда позже встанет обработка push-уведомлений.
 *
 * Осознанно кэшируем только саму оболочку приложения. Запросы к API всегда идут
 * в сеть: показать секретарю организации устаревший список получателей или
 * застывший прогресс генерации — хуже, чем честно показать ошибку сети.
 */

/** Заглушка «нет связи» — лежит в public/, попадает в предзагрузку вместе с оболочкой. */
const OFFLINE_PAGE = '/offline.html';

/*
 * Переходы по страницам — сначала сеть, без неё заглушка.
 *
 * Стоит раньше предзагрузки намеренно: иначе на «/» без сети отдавалась бы
 * сохранённая оболочка кабинета, она поднималась бы и крутила загрузку
 * без конца — API в кэш не кладём. Заглушка честно говорит, что связи нет.
 *
 * Страницу печати не трогаем вовсе: её открывает браузер воркера по токену,
 * и подменять ему ответ нельзя ни при каких обстоятельствах.
 */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.mode !== 'navigate') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.pathname === '/render') return;

  event.respondWith(
    fetch(request).catch(async () => {
      const cached = await matchPrecache(OFFLINE_PAGE);
      return cached ?? Response.error();
    }),
  );
});

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
