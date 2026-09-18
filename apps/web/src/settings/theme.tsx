import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { UiTheme } from '../api/org';
import { applyTheme, readStoredTheme } from './preferences';

interface ThemeStore {
  /** Что выбрал человек: светлая, тёмная или как в системе. */
  theme: UiTheme;
  /** Применить и запомнить в этом браузере. На сервер не ходит. */
  setTheme: (theme: UiTheme) => void;
}

const ThemeContext = createContext<ThemeStore | null>(null);

/**
 * Стор темы. Без внешних зависимостей: значение в React-состоянии,
 * копия в localStorage, применение — атрибутом `data-theme` на корне.
 *
 * Стартовое значение берётся из хранилища, а не с сервера: сервер
 * отвечает позже первой отрисовки, и без копии кабинет мигал бы
 * светлым у того, кто выбрал тёмную. Сервер потом только поправляет
 * расхождение (см. ThemeSync).
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<UiTheme>(readStoredTheme);

  const setTheme = useCallback((next: UiTheme) => {
    applyTheme(next);
    setThemeState(next);
  }, []);

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeStore {
  const store = useContext(ThemeContext);
  if (!store) throw new Error('useTheme вне ThemeProvider');
  return store;
}
