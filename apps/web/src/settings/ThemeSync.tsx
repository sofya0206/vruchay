import { useEffect } from 'react';
import { usePreferences } from '../api/org';
import { applyTheme } from './preferences';

/**
 * Приводит тему к той, что выбрана в настройках.
 *
 * До ответа сервера тема уже применена из localStorage (main.tsx), так
 * что этот запрос только исправляет расхождение — например, когда человек
 * сел за другой компьютер. Ничего не рисует.
 */
export function ThemeSync() {
  const { data } = usePreferences();

  useEffect(() => {
    if (data) applyTheme(data.theme);
  }, [data]);

  return null;
}
