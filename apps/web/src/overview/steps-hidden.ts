/**
 * Отметка «первые шаги убрали с главной».
 *
 * Живёт в браузере, а не на сервере: знание чисто интерфейсное и своё
 * у каждого, кто садится за этот компьютер. Заводить под подсказку поле
 * в базе и запрос на сохранение — платить за неё дороже, чем она стоит.
 */
const KEY = 'vru.steps-hidden';

/**
 * Ключ по почте: за одним компьютером входят в разные организации,
 * и «Скрыть», нажатое в одной, не должно прятать шаги в другой.
 */
function key(email?: string) {
  return email ? `${KEY}:${email}` : KEY;
}

export function stepsHidden(email?: string): boolean {
  try {
    return localStorage.getItem(key(email)) === '1';
  } catch {
    // Приватное окно или запрет на хранение: шаги просто покажутся
    // снова — это лучше, чем упасть на чтении localStorage.
    return false;
  }
}

export function markStepsHidden(email?: string): void {
  try {
    localStorage.setItem(key(email), '1');
  } catch {
    // См. stepsHidden: не сохранилось — не беда, блок закроется до перезагрузки.
  }
}
