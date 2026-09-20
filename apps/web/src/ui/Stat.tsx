import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from './cn';
import { Skeleton } from './Skeleton';

type Tone = 'default' | 'ok' | 'warn' | 'danger' | 'accent';

const valueTones: Record<Tone, string> = {
  default: 'text-ink',
  ok: 'text-ok',
  warn: 'text-warn',
  danger: 'text-danger',
  accent: 'text-accent',
};

/**
 * Плитка с числом: подпись, значение, единица и строка пояснения.
 *
 * Число крупное и табличное — читается с расстояния, слова только
 * подписывают. Ссылкой плитка становится целиком: маленькая стрелка
 * в углу на телефоне промахивалась. Загрузка — скелетон тех же размеров,
 * чтобы сетка не прыгала, когда числа приходят.
 */
export function Stat({
  label,
  value,
  unit,
  hint,
  tone = 'default',
  to,
  loading = false,
  aside,
  children,
  className = '',
}: {
  label: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  hint?: ReactNode;
  tone?: Tone;
  to?: string;
  loading?: boolean;
  /** Что стоит в правом верхнем углу: линия за период, значок. */
  aside?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const cls = cn(
    'card relative flex min-h-24 min-w-0 flex-col gap-1.5 self-stretch p-4 sm:min-h-28',
    to && 'transition-colors hover:bg-row-hover',
    className,
  );

  const body = loading ? (
    <>
      <Skeleton className="h-3.5 w-1/2" />
      <Skeleton className="h-8 w-1/3" />
      <Skeleton className="mt-auto h-3.5 w-2/3" />
    </>
  ) : (
    <>
      {aside && <div className="absolute top-3 right-3 hidden sm:block">{aside}</div>}
      <p className="text-sm text-muted">{label}</p>
      <p className="flex items-baseline gap-1.5">
        <span className={cn('tabular text-2xl leading-none font-semibold sm:text-3xl', valueTones[tone])}>
          {value}
        </span>
        {unit && <span className="text-sm text-muted">{unit}</span>}
      </p>
      {children}
      {hint && <p className="mt-auto text-sm text-muted">{hint}</p>}
    </>
  );

  if (to && !loading) {
    return (
      <Link to={to} className={cls}>
        {body}
      </Link>
    );
  }
  return <div className={cls}>{body}</div>;
}
