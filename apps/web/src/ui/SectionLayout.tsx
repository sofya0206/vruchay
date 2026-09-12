import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { cn } from './cn';

/**
 * Рама раздела с колонкой: слева списки, сверху панель с названием
 * и действиями, снизу строка состояния. Одна на документы, письма,
 * настройки и интеграции — устроенные одинаково разделы осваивают один раз.
 *
 * Колонка и обе полосы приклеены: список длинный, а «сколько всего»
 * и «создать» нужны в любой момент прокрутки. На телефоне колонка стоит
 * над панелью и превращается в ленту.
 */
export function SectionLayout({
  column,
  head,
  tools,
  bar,
  children,
}: {
  /** Содержимое левой колонки: кнопка создания, списки. */
  column: ReactNode;
  head: ReactNode;
  tools?: ReactNode;
  bar?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      <aside className="border-b border-[var(--line)] md:w-60 md:shrink-0 md:border-r md:border-b-0">
        <div className="p-3 md:sticky md:top-[var(--app-header)] md:max-h-[calc(100vh-var(--app-header))] md:overflow-y-auto">
          {column}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="z-10 flex flex-wrap items-center gap-3 border-b border-[var(--line)] bg-[var(--surface)] px-6 py-3 md:sticky md:top-[var(--app-header)]">
          <div className="min-w-[10rem] flex-1">{head}</div>
          {tools}
        </div>

        <main className="min-w-0 flex-1 px-6 py-6">{children}</main>

        {bar && (
          <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-3 border-t border-[var(--line)] bg-[var(--surface)] px-6 py-2.5 text-sm">
            {bar}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Рама раздела без колонки: та же панель сверху, что у `SectionLayout`,
 * но без списка слева — для разделов без внутренних папок (Реестр, Счета,
 * Оплата).
 *
 * Раньше такие разделы начинались большим заголовком с абзацем-подводкой
 * и отступом до него: рядом с «Документами» или «Письмами», где название
 * раздела стоит вплотную к шапке, это читалось как переход на другую
 * страницу, а не соседний раздел одного кабинета. Теперь панель везде
 * на одной высоте и одного роста.
 */
export function PageLayout({
  head,
  tools,
  children,
}: {
  head: ReactNode;
  tools?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="z-10 flex flex-wrap items-center gap-3 border-b border-[var(--line)] bg-[var(--surface)] px-6 py-3 md:sticky md:top-[var(--app-header)]">
        <div className="min-w-[10rem] flex-1">{head}</div>
        {tools}
      </div>

      <main className="min-w-0 flex-1 px-6 py-6">{children}</main>
    </div>
  );
}

/** Название списка в панели раздела — с числом, если есть. */
export function SectionTitle({ children, count }: { children: ReactNode; count?: number | null }) {
  return (
    <div className="flex min-w-0 items-baseline gap-2">
      <h1 className="truncate text-lg font-medium">{children}</h1>
      {count != null && <span className="tabular text-sm text-[var(--text-muted)]">{count}</span>}
    </div>
  );
}

/** Список колонки: на телефоне — лента вбок, на десктопе — столбик. */
export function ColumnList({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <ul className={cn('flex gap-1 overflow-x-auto md:flex-col md:overflow-visible', className)}>
      {children}
    </ul>
  );
}

/**
 * Строка колонки — ссылка на список. Активность считается снаружи:
 * у папок один адрес и разный `?folder=`, о котором `NavLink` не знает.
 */
export function ColumnRow({
  to,
  icon: Icon,
  active,
  count,
  nested,
  tint,
  children,
  onContextMenu,
  trailing,
}: {
  to: string;
  icon: LucideIcon;
  active?: boolean;
  count?: number | null;
  nested?: boolean;
  /** Цвет иконки в покое, например красный у «Не доставлено». */
  tint?: string;
  children: ReactNode;
  onContextMenu?: (e: React.MouseEvent<HTMLElement>) => void;
  /** Что стоит справа от строки (например, «…»). */
  trailing?: ReactNode;
}) {
  return (
    <li className="group flex items-center">
      <NavLink
        to={to}
        end
        aria-current={active ? 'page' : undefined}
        onContextMenu={onContextMenu}
        className={cn(
          'flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-3 py-2 text-sm whitespace-nowrap transition-colors',
          nested && 'md:pl-8',
          active
            ? 'bg-[var(--accent-soft)] font-medium text-[var(--accent)]'
            : 'text-[var(--text-muted)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text)]',
        )}
      >
        <Icon size={16} strokeWidth={1.75} className={cn('shrink-0', !active && tint)} />
        <span className="md:flex-1 md:truncate">{children}</span>
        {count ? <span className="tabular text-xs text-[var(--text-muted)]">{count}</span> : null}
      </NavLink>
      {trailing}
    </li>
  );
}
