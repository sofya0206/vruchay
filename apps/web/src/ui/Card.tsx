import type { HTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { cn } from './cn';

type Padding = 'none' | 'sm' | 'md';
type Tone = 'default' | 'danger' | 'info';

const paddings: Record<Padding, string> = {
  none: 'p-0',
  sm: 'p-4',
  md: 'p-5 sm:p-6',
};

const tones: Record<Tone, string> = {
  default: 'card',
  danger: 'rounded-card bg-surface ring-1 ring-danger/50',
  info: 'rounded-card bg-accent-soft',
};

/**
 * Карточка — единственная рама для блоков содержимого в кабинете.
 *
 * Глубина — подложка и волосяная линия, тени в покое нет. Заголовок,
 * подводка и действие справа собираются здесь же (`title`, `about`,
 * `action` или ссылка «в раздел»), поэтому карточки разных разделов
 * начинаются одинаково.
 */
export function Card({
  padding = 'md',
  tone = 'default',
  interactive = false,
  title,
  count,
  about,
  to,
  linkLabel,
  action,
  className = '',
  children,
  ...rest
}: HTMLAttributes<HTMLElement> & {
  padding?: Padding;
  tone?: Tone;
  /** Карточка целиком нажимается: рамка темнеет под указателем. */
  interactive?: boolean;
  title?: ReactNode;
  count?: number | null;
  about?: ReactNode;
  to?: string;
  linkLabel?: string;
  /** Что стоит в правом углу вместо ссылки. */
  action?: ReactNode;
}) {
  return (
    <section
      className={cn(
        tones[tone],
        paddings[padding],
        interactive &&
          'cursor-pointer transition-[box-shadow] hover:[box-shadow:inset_0_0_0_1px_var(--line-strong)]',
        className,
      )}
      {...rest}
    >
      {(title || action || (to && linkLabel)) && (
        <CardHeader title={title} count={count} about={about} action={action} to={to} linkLabel={linkLabel} />
      )}
      {children}
    </section>
  );
}

/** Шапка карточки: название с числом, подводка, действие или ссылка справа. */
export function CardHeader({
  title,
  count,
  about,
  action,
  to,
  linkLabel,
  className = '',
}: {
  title?: ReactNode;
  count?: number | null;
  about?: ReactNode;
  action?: ReactNode;
  to?: string;
  linkLabel?: string;
  className?: string;
}) {
  return (
    <div className={cn('mb-4 flex items-start justify-between gap-4', className)}>
      <div className="min-w-0">
        {title && (
          <h2 className="flex items-baseline gap-2 text-base font-medium">
            <span className="truncate">{title}</span>
            {count != null && <span className="tabular text-sm font-normal text-muted">{count}</span>}
          </h2>
        )}
        {about && <p className="mt-0.5 text-sm text-muted">{about}</p>}
      </div>
      {action}
      {!action && to && linkLabel && (
        <Link
          to={to}
          className="inline-flex shrink-0 items-center gap-1 text-sm text-accent transition-colors hover:underline"
        >
          {linkLabel} <ArrowRight size={14} aria-hidden />
        </Link>
      )}
    </div>
  );
}

/** Список строк внутри карточки на общей подложке, разделённых линией. */
export function Rows({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <ul className={cn('hairline divide-y divide-line overflow-hidden rounded-card', className)}>{children}</ul>;
}
