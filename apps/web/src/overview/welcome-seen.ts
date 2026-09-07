/**
 * Отметка «входную инструкцию посмотрели».
 *
 * Живёт в браузере, а не на сервере: знание чисто интерфейсное и своё
 * у каждого, кто садится за этот компьютер. Заводить под подсказку поле
 * в базе и запрос на сохранение — платить за неё дороже, чем она стоит.
 */
const KEY = 'vru.welcome-seen';

/**
 * Ключ по почте: за одним компьютером входят в разные организации,
 * и «Ясно», нажатое в одной, не должно прятать инструкцию в другой.
 */
function key(email?: string) {
  return email ? `${KEY}:${email}` : KEY;
}

export function welcomeSeen(email?: string): boolean {
  try {
    return localStorage.getItem(key(email)) === '1';
  } catch {
    // Приватное окно или запрет на хранение: инструкция просто покажется
    // снова — это лучше, чем упасть на чтении localStorage.
    return false;
  }
}

export function markWelcomeSeen(email?: string): void {
  try {
    localStorage.setItem(key(email), '1');
  } catch {
    // См. welcomeSeen: не сохранилось — не беда, экран закроется до перезагрузки.
  }
}
