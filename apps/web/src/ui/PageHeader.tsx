import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { cn } from './cn';

/**
 * Шапка страницы — одна на весь кабинет.
 *
 * Название с числом, одно действие справа, при необходимости — путь
 * назад с подписью (не безымянная стрелка по истории браузера) и строка
 * вкладок под названием. Стоит внутри панели `SectionLayout`/`PageLayout`,
 * поэтому сама отступов не несёт.
 */
export function PageHeader({
  title,
  count,
  about,
  actions,
  tabs,
  back,
  className = '',
}: {
  title: ReactNode;
  count?: number | null;
  about?: ReactNode;
  /** Действия справа — одно залитое, остальные вторичные. */
  actions?: ReactNode;
  /** Строка под названием: вкладки, поиск. */
  tabs?: ReactNode;
  /** Родительский раздел: «‹ Документы». */
  back?: { to: string; label: string };
  className?: string;
}) {
  return (
    <div className={cn('min-w-0 flex-1', className)}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {back && (
          <Link
            to={back.to}
            className="pressable -ml-2 inline-flex h-8 items-center gap-0.5 rounded-control pr-2 pl-1 text-sm text-muted hover:bg-sunken hover:text-ink"
          >
            <ChevronLeft size={16} aria-hidden />
            {back.label}
          </Link>
        )}
        <div className="flex min-w-0 items-baseline gap-2">
          <h1 className="truncate text-lg font-medium">{title}</h1>
          {count != null && <span className="tabular text-sm text-muted">{count}</span>}
        </div>
        {actions && <div className="ml-auto flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      {about && <p className="mt-0.5 text-sm text-muted">{about}</p>}
      {tabs && <div className="mt-3">{tabs}</div>}
    </div>
  );
}
