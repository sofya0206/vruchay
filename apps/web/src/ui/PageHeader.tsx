import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

/**
 * Заголовок страницы — один на весь кабинет.
 *
 * `h1` в одном кегле везде, подводка под ним, действия справа. У вложенных
 * экранов — путь «Документы › Название»: это и есть дорога назад, ясная
 * и с подписью, вместо безымянной стрелки по истории браузера.
 */
export function PageHeader({
  title,
  about,
  parent,
  actions,
  children,
}: {
  title: ReactNode;
  about?: ReactNode;
  /** Родительский раздел: ссылка перед названием. */
  parent?: { to: string; label: string };
  actions?: ReactNode;
  /** Строка под заголовком: вкладки, поиск. */
  children?: ReactNode;
}) {
  return (
    <div className="mb-6">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          {parent && (
            <p className="mb-1 flex items-center gap-1 text-sm text-[var(--text-muted)]">
              <Link to={parent.to} className="hover:text-[var(--text)] hover:underline">
                {parent.label}
              </Link>
              <ChevronRight size={14} aria-hidden />
            </p>
          )}
          <h1 className="text-2xl font-medium">{title}</h1>
          {about && <p className="mt-1 max-w-2xl text-[var(--text-muted)]">{about}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}
