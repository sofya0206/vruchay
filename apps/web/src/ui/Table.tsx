import type { HTMLAttributes, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import { ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react';
import { cn } from './cn';

/**
 * Таблица — одна на реестр, журнал писем, проверку, команду, журнал
 * действий и токены.
 *
 * Шапка липнет под шапку кабинета, строки 44 точки (`dense` — 36), под
 * указателем строка красится тихим токеном. На телефоне таблица из
 * восьми колонок не читается — вместо неё `cards`: тот же список
 * карточками, который рисует вызывающий.
 */
export function Table({
  children,
  cards,
  stickyHeader = true,
  dense = false,
  caption,
  className = '',
}: {
  children: ReactNode;
  /** Тот же список карточками для телефона. */
  cards?: ReactNode;
  stickyHeader?: boolean;
  dense?: boolean;
  /** Что в таблице — для читалки. */
  caption?: string;
  className?: string;
}) {
  return (
    <>
      <div className={cn('overflow-x-auto', cards ? 'max-md:hidden' : undefined, className)}>
        <table
          data-dense={dense || undefined}
          data-sticky={stickyHeader || undefined}
          className="group/table w-full border-separate border-spacing-0 text-sm"
        >
          {caption && <caption className="sr-only">{caption}</caption>}
          {children}
        </table>
      </div>
      {cards && <div className="md:hidden">{cards}</div>}
    </>
  );
}

export function THead({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <thead className={className}>{children}</thead>;
}

export function TBody({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <tbody className={className}>{children}</tbody>;
}

export type SortDir = 'asc' | 'desc' | null;

export function Th({
  children,
  align = 'left',
  width,
  sortable,
  sort = null,
  onSort,
  className = '',
  ...rest
}: ThHTMLAttributes<HTMLTableCellElement> & {
  align?: 'left' | 'right' | 'center';
  width?: number | string;
  sortable?: boolean;
  sort?: SortDir;
  onSort?: () => void;
}) {
  const SortIcon = sort === 'asc' ? ChevronUp : sort === 'desc' ? ChevronDown : ChevronsUpDown;
  return (
    <th
      scope="col"
      aria-sort={sort ? (sort === 'asc' ? 'ascending' : 'descending') : undefined}
      style={width !== undefined ? { width } : undefined}
      className={cn(
        'h-10 border-b border-line bg-surface px-3 text-xs font-medium whitespace-nowrap text-muted',
        'group-data-sticky/table:sticky group-data-sticky/table:top-[var(--app-header)] group-data-sticky/table:z-10',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        align === 'left' && 'text-left',
        className,
      )}
      {...rest}
    >
      {sortable ? (
        <button
          type="button"
          onClick={onSort}
          className={cn(
            'pressable -mx-1.5 inline-flex h-7 items-center gap-1 rounded-control px-1.5 hover:bg-sunken hover:text-ink',
            sort && 'text-ink',
          )}
        >
          {children}
          <SortIcon size={14} aria-hidden className={cn(!sort && 'text-line-strong')} />
        </button>
      ) : (
        children
      )}
    </th>
  );
}

export function Tr({
  children,
  selected,
  onClick,
  className = '',
  ...rest
}: HTMLAttributes<HTMLTableRowElement> & { selected?: boolean }) {
  return (
    <tr
      aria-selected={selected}
      onClick={onClick}
      className={cn(
        'group/row transition-colors',
        onClick && 'cursor-pointer',
        selected ? 'bg-accent-soft' : 'hover:bg-row-hover',
        className,
      )}
      {...rest}
    >
      {children}
    </tr>
  );
}

export function Td({
  children,
  align = 'left',
  numeric = false,
  className = '',
  ...rest
}: TdHTMLAttributes<HTMLTableCellElement> & {
  align?: 'left' | 'right' | 'center';
  numeric?: boolean;
}) {
  return (
    <td
      className={cn(
        'h-11 border-b border-line px-3 align-middle group-data-dense/table:h-9 group-data-dense/table:py-1',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        numeric && 'tabular',
        className,
      )}
      {...rest}
    >
      {children}
    </td>
  );
}

/**
 * Полоса действий над отмеченными строками. Появляется, когда отмечена
 * хотя бы одна, стоит у нижнего края и не заслоняет таблицу.
 */
export function TableSelectionBar({
  count,
  onClear,
  children,
  className = '',
}: {
  count: number;
  onClear?: () => void;
  children: ReactNode;
  className?: string;
}) {
  if (count === 0) return null;
  return (
    <div
      role="toolbar"
      aria-label="Действия с отмеченными"
      className={cn(
        'sticky bottom-4 z-20 mx-auto flex w-fit max-w-full flex-wrap items-center gap-2 rounded-card bg-raised p-2 pl-4 shadow-lg ring-1 ring-line',
        className,
      )}
    >
      <span className="tabular text-sm font-medium">
        Отмечено: {count}
      </span>
      <span aria-hidden className="mx-1 h-5 w-px bg-line" />
      {children}
      {onClear && (
        <button
          type="button"
          onClick={onClear}
          className="pressable ml-1 rounded-control px-2.5 py-1.5 text-sm text-muted hover:bg-sunken hover:text-ink"
        >
          Снять отметки
        </button>
      )}
    </div>
  );
}
