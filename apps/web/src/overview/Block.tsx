import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

/**
 * Блок полосы — рама, одна на все четыре.
 *
 * Главная перестала помещаться в экран намеренно: это не оглавление,
 * а полоса работ, которую листают сверху вниз. Чтобы листалась, блоки
 * должны быть различимы на глаз — отсюда линия между ними и одинаковый
 * заголовок у каждого. Разная рамка у каждого блока превратила бы полосу
 * обратно в набор карточек, из которого человек выбирает, куда нажать.
 *
 * Ссылка справа ведёт в раздел целиком: на главной стоит рабочая часть,
 * а всё остальное — списки, архив, настройки — за этой ссылкой.
 */
export function Block({
  title,
  about,
  to,
  linkLabel,
  children,
}: {
  title: string;
  about?: ReactNode;
  to?: string;
  linkLabel?: string;
  children: ReactNode;
}) {
  return (
    <section className="py-10 first:pt-0">
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2">
        <div className="min-w-0">
          <h2 className="text-[length:var(--text-subheading)] font-medium">{title}</h2>
          {about && (
            <p className="mt-1 max-w-prose text-sm text-[var(--text-muted)]">{about}</p>
          )}
        </div>
        {to && linkLabel && (
          <Link
            to={to}
            className="inline-flex shrink-0 items-center gap-1 text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--text)]"
          >
            {linkLabel} <ArrowRight size={14} />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

/**
 * Список внутри блока: строки на общей подложке.
 *
 * Подложка одна на весь список, а не своя у каждой строки: пять карточек
 * подряд читаются как пять предложений выбрать, тогда как это один список
 * последних дел.
 */
export function Rows({ children }: { children: ReactNode }) {
  return (
    <ul className="divide-y divide-[var(--line)] overflow-hidden rounded-[var(--radius-card)] bg-[var(--surface)] shadow-[var(--ring-line)]">
      {children}
    </ul>
  );
}

/** Пустое место блока — словами, без картинки и без рамки. */
export function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-[var(--radius-card)] bg-[var(--surface-sunken)] px-4 py-8 text-center text-sm text-[var(--text-muted)]">
      {children}
    </p>
  );
}
