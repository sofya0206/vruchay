import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { cn } from './cn';

/**
 * Карточка — единственная рама для блоков содержимого в кабинете.
 *
 * Заголовок, подводка, слот действия справа или ссылка «в раздел».
 * Без заголовка — просто белая карточка с волосяной линией.
 */
export function Card({
  title,
  about,
  to,
  linkLabel,
  action,
  children,
  className = '',
}: {
  title?: ReactNode;
  about?: ReactNode;
  to?: string;
  linkLabel?: string;
  /** Что стоит в правом углу вместо ссылки. */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('card p-5 sm:p-6', className)}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-4">
          <div className="min-w-0">
            {title && <h2 className="text-lg font-medium">{title}</h2>}
            {about && <p className="mt-0.5 text-sm text-[var(--text-muted)]">{about}</p>}
          </div>
          {action}
          {!action && to && linkLabel && (
            <Link
              to={to}
              className="inline-flex shrink-0 items-center gap-1 text-sm text-[var(--accent)] transition-colors hover:underline"
            >
              {linkLabel} <ArrowRight size={14} />
            </Link>
          )}
        </div>
      )}
      {children}
    </section>
  );
}

/** Список строк внутри карточки на общей подложке, разделённых линией. */
export function Rows({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <ul className={cn('hairline divide-y divide-[var(--line)] overflow-hidden rounded-xl', className)}>
      {children}
    </ul>
  );
}
