import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

/**
 * Карточка рабочего стола: заголовок со счётчиком и ссылкой, тело ниже.
 *
 * Карточка, а не секция с линией: на новой главной блоки стоят в две
 * колонки, и разделять их линиями уже нечем. Рамка одна на карточку,
 * тени нет — глубину даёт только волосяная линия, как везде в кабинете.
 */
export function Card({
  title,
  count,
  to,
  linkLabel,
  children,
}: {
  title: string;
  count?: ReactNode;
  to?: string;
  linkLabel?: string;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-[var(--radius-card)] bg-[var(--surface)] shadow-[var(--ring-line)]">
      <header className="flex items-center gap-2.5 border-b border-[var(--line)] px-4 py-3">
        <h2 className="text-base font-medium">{title}</h2>
        {count !== undefined && (
          <span className="text-sm text-[var(--text-muted)] tabular-nums">{count}</span>
        )}
        {/* Стрелка без подписи: карточка уже названа как раздел, и «Весь
            реестр» рядом с «Реестр выданного» повторяло слово. Куда ведёт —
            в подсказке и для чтения с экрана. */}
        {to && linkLabel && (
          <Link
            to={to}
            title={linkLabel}
            aria-label={linkLabel}
            className="-my-1 ml-auto grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text)]"
          >
            <ArrowRight size={18} />
          </Link>
        )}
      </header>
      {children}
    </section>
  );
}

export function Rows({ children }: { children: ReactNode }) {
  return <ul className="divide-y divide-[var(--line)]">{children}</ul>;
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="px-4 py-8 text-center text-sm text-[var(--text-muted)]">{children}</p>
  );
}
