import type { OnboardingEvent } from '@gramota/shared';

/**
 * Счётчики обучения: где показали, где прошли, где закрыли.
 *
 * Шлём пачкой раз в полсекунды и не ждём ответа: подсказка не должна
 * зависеть от того, дошла ли статистика. Кто именно закрыл — не
 * отправляется и не хранится; сервер складывает только числа по дням.
 */

let queue: OnboardingEvent[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

function flush(keepalive = false) {
  if (timer) clearTimeout(timer);
  timer = null;
  if (queue.length === 0) return;
  const events = queue.slice(0, 20);
  queue = queue.slice(20);
  void fetch('/api/onboarding/events', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ events }),
    keepalive,
  }).catch(() => {
    // Статистика не дошла — жалко, но подсказке это не мешает.
  });
  if (queue.length) flush(keepalive);
}

export function track(event: OnboardingEvent) {
  queue.push(event);
  if (!timer) timer = setTimeout(() => flush(), 500);
}

if (typeof window !== 'undefined') {
  // Закрытие вкладки — самый частый момент «бросил», его терять нельзя.
  window.addEventListener('pagehide', () => flush(true));
}
