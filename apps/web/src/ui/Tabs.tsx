import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from './cn';

export interface TabItem<T extends string> {
  id: T;
  label: ReactNode;
}

/**
 * Сегментный переключатель — вкладки одной страницы.
 *
 * Один на кабинет: реестр/аналитика, счета, площадки кода вставки.
 * Стрелки влево-вправо ходят по вкладкам, как в любой системной вкладке.
 */
export function Tabs<T extends string>({
  items,
  value,
  onChange,
  label,
  className = '',
}: {
  items: TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  label: string;
  className?: string;
}) {
  const root = useRef<HTMLDivElement>(null);

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const i = items.findIndex((t) => t.id === value);
    const next = items[(i + (e.key === 'ArrowRight' ? 1 : items.length - 1)) % items.length];
    onChange(next.id);
    root.current?.querySelector<HTMLButtonElement>(`[data-tab="${next.id}"]`)?.focus();
  }

  return (
    <div
      ref={root}
      role="tablist"
      aria-label={label}
      onKeyDown={onKey}
      className={cn(
        'inline-flex max-w-full gap-0.5 overflow-x-auto rounded-lg bg-[var(--surface-sunken)] p-0.5',
        className,
      )}
    >
      {items.map((tab) => {
        const active = tab.id === value;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            data-tab={tab.id}
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(tab.id)}
            className={cn(
              'h-9 shrink-0 rounded-[6px] px-3.5 text-sm font-medium whitespace-nowrap transition-colors',
              active
                ? 'bg-[var(--surface)] text-[var(--text)] shadow-sm'
                : 'text-[var(--text-muted)] hover:text-[var(--text)]',
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
