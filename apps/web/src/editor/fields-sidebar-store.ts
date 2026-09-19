import { useSyncExternalStore } from 'react';

/**
 * Открыта ли панель полей — одно состояние на все вкладки материала.
 *
 * Лист и остальные вкладки живут на разных адресах и разных страницах,
 * и состояние внутри страницы терялось бы при каждом переходе: открыл
 * поля на листе, ушёл в письмо — панель закрылась. Держим его вне React
 * и в localStorage, чтобы панель переживала и переход, и перезагрузку.
 */

const KEY = 'vruchay.fields-panel';
const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === 'open';
  } catch {
    return false;
  }
}

/*
 * На узком экране панель ложится поверх листа, поэтому при загрузке она
 * свёрнута, что бы ни запомнилось на широком: иначе открытый материал
 * с телефона встречал бы не лист, а список полей во весь экран.
 */
function wide(): boolean {
  try {
    return window.matchMedia('(min-width: 768px)').matches;
  } catch {
    return true;
  }
}

let open = read() && wide();

export function setFieldsPanelOpen(next: boolean) {
  if (next === open) return;
  open = next;
  try {
    localStorage.setItem(KEY, next ? 'open' : 'closed');
  } catch {
    // Хранилище закрыто — панель просто не переживёт перезагрузку.
  }
  for (const listener of listeners) listener();
}

export function toggleFieldsPanel() {
  setFieldsPanelOpen(!open);
}

export function useFieldsPanelOpen(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => open,
    () => false,
  );
}
