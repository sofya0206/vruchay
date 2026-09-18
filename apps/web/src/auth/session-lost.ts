import type { QueryClient } from '@tanstack/react-query';
import { ApiError } from '../api/client';

const RETURN_KEY = 'vruchay:after-login';

let leaving = false;

/**
 * Вход пропал посреди работы: истёк срок, вышли на другом устройстве,
 * браузер потерял куку. Каждый экран при этом показывал «Сервер
 * не ответил» — и ни один не говорил, что надо просто войти заново.
 *
 * До входа 401 — обычный ответ на неверный пароль, поэтому смотрим,
 * вошёл ли человек: без этого форма входа уходила бы сама в себя.
 */
export function handleSessionLost(error: unknown, client: QueryClient): void {
  if (!(error instanceof ApiError) || error.status !== 401) return;
  if (!client.getQueryData(['me']) || leaving) return;
  leaving = true;
  rememberReturnPath(window.location.pathname + window.location.search);
  window.location.replace('/login');
}

export function rememberReturnPath(path: string): void {
  try {
    sessionStorage.setItem(RETURN_KEY, path);
  } catch {
    // Без хранилища вернёмся на главную — это не повод оставаться на ошибке.
  }
}

/** Куда вернуть после входа: только путь своего сайта, не чужая ссылка. */
export function readReturnPath(): string | null {
  try {
    const path = sessionStorage.getItem(RETURN_KEY);
    return path && path.startsWith('/') && !path.startsWith('//') ? path : null;
  } catch {
    return null;
  }
}

export function clearReturnPath(): void {
  try {
    sessionStorage.removeItem(RETURN_KEY);
  } catch {
    // Нечего чистить.
  }
}
