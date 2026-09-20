import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { LifeBuoy, RefreshCw, TriangleAlert, WifiOff } from 'lucide-react';
import { Button } from './Button';
import { cn } from './cn';

/**
 * Ошибка вместо пустоты.
 *
 * Отказ запроса раньше выглядел как «у вас ничего нет» — худший вид
 * ошибки: человек верит и уходит. Здесь три части и две кнопки:
 * что случилось, почему, что сделать; «Повторить» и «В поддержку».
 *
 * В поддержку уходит контекст сам: экран, объект, код ошибки, время.
 * Человеку не нужно пересказывать, где он был и что нажал.
 */
export function ErrorState({
  title = 'Не загрузилось',
  children,
  onRetry,
  retrying,
  offline,
  code,
  className = '',
}: {
  title?: ReactNode;
  /** Почему и что сделать. Одна-две фразы. */
  children?: ReactNode;
  onRetry?: () => void;
  retrying?: boolean;
  /** Сеть, а не сервер: другая иконка и другая подсказка. */
  offline?: boolean;
  /** Код или текст ошибки для поддержки. Человеку не показывается. */
  code?: string;
  className?: string;
}) {
  const { pathname } = useLocation();
  const Icon = offline ? WifiOff : TriangleAlert;
  const context = new URLSearchParams({
    context: [pathname, code ?? '', new Date().toISOString()].filter(Boolean).join(' · '),
  });

  return (
    <div
      role="alert"
      className={cn('flex flex-col items-center px-6 py-12 text-center', className)}
    >
      <span className="grid size-14 place-items-center rounded-full bg-danger-soft text-danger">
        <Icon size={26} strokeWidth={1.75} />
      </span>
      <p className="mt-4 text-lg font-medium">{title}</p>
      <div className="mt-1 max-w-md text-sm text-muted">
        {children ??
          (offline
            ? 'Похоже, пропала связь. Проверьте сеть и попробуйте снова.'
            : 'Сервер не ответил. Данные никуда не делись — попробуйте снова.')}
      </div>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {onRetry && (
          <Button
            variant="primary"
            icon={<RefreshCw size={16} className={retrying ? 'animate-spin' : ''} />}
            disabled={retrying}
            onClick={onRetry}
          >
            Повторить
          </Button>
        )}
        <Button variant="ghost" to={`/support?${context}`} icon={<LifeBuoy size={16} />}>
          В поддержку
        </Button>
      </div>
    </div>
  );
}

/** Тонкая полоса ошибки внутри карточки или над таблицей. */
export function ErrorBar({
  children,
  onRetry,
  className = '',
}: {
  children: ReactNode;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-wrap items-center gap-3 rounded-card bg-danger-soft px-4 py-3 text-sm',
        className,
      )}
    >
      <TriangleAlert size={16} className="shrink-0 text-danger" />
      <span className="min-w-0 flex-1">{children}</span>
      {onRetry && (
        <Button size="sm" onClick={onRetry} icon={<RefreshCw size={14} />}>
          Повторить
        </Button>
      )}
    </div>
  );
}
