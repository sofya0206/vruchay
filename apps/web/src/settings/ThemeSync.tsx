import { useEffect } from 'react';
import { usePreferences } from '../api/org';
import { useTheme } from './theme';

/**
 * Приводит тему к той, что выбрана в настройках.
 *
 * До ответа сервера тема уже применена из localStorage (main.tsx), так
 * что этот запрос только исправляет расхождение — например, когда человек
 * сел за другой компьютер. Ничего не рисует.
 */
export function ThemeSync() {
  const { data } = usePreferences();
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    // Сверяем только по ответу сервера: локальный выбор в зависимости не
    // заводим, иначе смена темы в настройках тут же откатилась бы к старому
    // ответу, пока новый не доехал.
    if (data && data.theme !== theme) setTheme(data.theme);
  }, [data]);

  return null;
}
