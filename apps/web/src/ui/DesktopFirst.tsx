import { useState, type ReactNode } from 'react';
import { Monitor } from 'lucide-react';
import { Button } from './Button';
import { NextAction } from './NextAction';
import { usePhone } from './useMediaQuery';

/**
 * «Удобнее с компьютера» — для работы, которую на телефоне делать мучительно.
 *
 * Настройка DNS — это копирование длинных записей между кабинетом
 * и панелью регистратора, двумя вкладками рядом. На телефоне это
 * переключение приложений на каждую строку и опечатка в ключе DKIM.
 * Честно говорим об этом, а не прячем и не делаем кривую версию:
 * кто всё же хочет с телефона — открывает одной кнопкой.
 *
 * `compact` — не заслон, а плашка над содержимым: таблицу получателей
 * на телефоне видно и можно отметить строки, а вот править ячейки
 * удобнее за столом.
 */
export function DesktopFirst({
  title,
  why,
  compact = false,
  children,
}: {
  /** Что именно удобнее с компьютера — «Настройку доменов». */
  title: string;
  /** Почему — одна фраза, без извинений. */
  why: ReactNode;
  compact?: boolean;
  children: ReactNode;
}) {
  const phone = usePhone();
  const [shown, setShown] = useState(false);
  if (!phone || shown) return <>{children}</>;

  if (compact) {
    return (
      <>
        <div className="mb-3 flex items-center gap-3 rounded-card bg-accent-soft px-4 py-3 text-sm">
          <Monitor size={18} className="shrink-0 text-accent" aria-hidden />
          <span className="min-w-0 flex-1">{title} удобнее сделать с компьютера.</span>
          <Button size="sm" variant="ghost" onClick={() => setShown(true)}>
            Понятно
          </Button>
        </div>
        {children}
      </>
    );
  }

  return (
    <div className="card">
      <NextAction
        icon={Monitor}
        title={`${title} удобнее сделать с компьютера`}
        text={why}
        primary={
          <Button variant="secondary" size="lg" onClick={() => setShown(true)}>
            Всё равно открыть
          </Button>
        }
      />
    </div>
  );
}
