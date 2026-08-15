const KEY = 'vruchay:ref';

/**
 * Код приглашения переживает переходы по сайту.
 *
 * Ссылка друга ведёт на /register, но человек запросто уйдёт с неё
 * почитать «а что это вообще такое», а вернётся уже без кода в адресе —
 * и приглашение потеряется вместе с бонусом обеих сторон. Поэтому код,
 * встреченный на любой странице, откладываем и достаём при регистрации.
 *
 * Хранение в localStorage, а не в cookie: код не участвует ни в одном
 * решении на сервере до самой регистрации, и отправлять его при каждом
 * запросе незачем.
 */
export function rememberRefFromUrl(search: string): void {
  const raw = new URLSearchParams(search).get('ref');
  if (!raw) return;

  const code = raw.trim().toLowerCase();
  // Тот же вид, что признаёт сервер. Мусор из адресной строки не храним.
  if (!/^[a-z0-9]{4,16}$/.test(code)) return;

  try {
    localStorage.setItem(KEY, code);
  } catch {
    // Приватный режим или запрет на хранилище. Приглашение сработает,
    // только если человек зарегистрируется не уходя со страницы.
  }
}

export function storedRef(): string | undefined {
  try {
    return localStorage.getItem(KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

/** После успешной регистрации код больше не нужен. */
export function forgetRef(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* нечего чистить */
  }
}
