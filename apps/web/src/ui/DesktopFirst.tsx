import { useState, type ReactNode } from 'react';
import { Monitor } from 'lucide-react';
import { Button } from './Button';
import { EmptyState } from './EmptyState';
import { usePhone } from './useMediaQuery';

/**
 * «Удобнее с компьютера» — для работы, которую на телефоне делать мучительно.
 *
 * Настройка DNS — это копирование длинных записей между кабинетом
 * и панелью регистратора, двумя вкладками рядом. На телефоне это
 * переключение приложений на каждую строку и опечатка в ключе DKIM.
 * Честно говорим об этом, а не прячем и не делаем кривую версию:
 * кто всё же хочет с телефона — открывает одной кнопкой.
 */
export function DesktopFirst({
  title,
  why,
  children,
}: {
  /** Что именно удобнее с компьютера — «Настройку доменов». */
  title: string;
  /** Почему — одна фраза, без извинений. */
  why: ReactNode;
  children: ReactNode;
}) {
  const phone = usePhone();
  const [shown, setShown] = useState(false);
  if (!phone || shown) return <>{children}</>;
  return (
    <div className="card">
      <EmptyState
        icon={Monitor}
        title={`${title} удобнее сделать с компьютера`}
        action={
          <Button variant="secondary" onClick={() => setShown(true)} className="h-11">
            Всё равно открыть
          </Button>
        }
      >
        {why}
      </EmptyState>
    </div>
  );
}
