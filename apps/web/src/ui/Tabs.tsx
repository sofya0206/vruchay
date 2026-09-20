import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from './cn';

export interface TabItem<T extends string> {
  id: T;
  label: ReactNode;
  /** Число справа от подписи. */
  count?: number | null;
}

interface TabsProps<T extends string> {
  items: TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  label: string;
  /** Вкладки делят ширину поровну — для узкой боковой панели. */
  stretch?: boolean;
  className?: string;
}

function useRoving<T extends string>(items: TabItem<T>[], value: T, onChange: (id: T) => void) {
  const root = useRef<HTMLDivElement>(null);
  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const i = items.findIndex((t) => t.id === value);
    const next = items[(i + (e.key === 'ArrowRight' ? 1 : items.length - 1)) % items.length];
    onChange(next.id);
    root.current?.querySelector<HTMLButtonElement>(`[data-tab="${next.id}"]`)?.focus();
  }
  return { root, onKey };
}

/**
 * Сегментный переключатель — вкладки уровня страницы.
 *
 * Один на кабинет: реестр/аналитика, документы/только текст. Стрелки
 * влево-вправо ходят по вкладкам, как в любой системной вкладке.
 */
export function Segmented<T extends string>({
  items,
  value,
  onChange,
  label,
  stretch = false,
  className = '',
}: TabsProps<T>) {
  const { root, onKey } = useRoving(items, value, onChange);

  return (
    <div
      ref={root}
      role="tablist"
      aria-label={label}
      onKeyDown={onKey}
      className={cn(
        stretch ? 'flex w-full' : 'inline-flex max-w-full',
        'no-scrollbar gap-0.5 overflow-x-auto rounded-control bg-sunken p-0.5',
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
              'pressable inline-flex h-9 items-center justify-center gap-1.5 rounded-[6px] px-3.5 text-sm font-medium whitespace-nowrap',
              stretch ? 'min-w-0 flex-1' : 'shrink-0',
              active ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink',
            )}
          >
            {tab.label}
            {tab.count != null && (
              <span className={cn('tabular text-xs', active ? 'text-muted' : 'text-muted/80')}>{tab.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Прежнее имя сегментного переключателя. */
export const Tabs = Segmented;

/**
 * Вкладки с подчёркиванием — разделы внутри панели.
 *
 * Легче сегментного: без подложки, только линия под выбранной. Для
 * правой панели редактора и подобных мест, где сегмент на подложке
 * спорил бы с карточками вокруг.
 */
export function UnderlineTabs<T extends string>({
  items,
  value,
  onChange,
  label,
  stretch = false,
  className = '',
}: TabsProps<T>) {
  const { root, onKey } = useRoving(items, value, onChange);

  return (
    <div
      ref={root}
      role="tablist"
      aria-label={label}
      onKeyDown={onKey}
      className={cn('no-scrollbar flex gap-1 overflow-x-auto border-b border-line', className)}
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
              'relative -mb-px inline-flex h-10 items-center justify-center gap-1.5 px-3 text-sm font-medium whitespace-nowrap transition-colors',
              stretch ? 'min-w-0 flex-1' : 'shrink-0',
              active ? 'text-ink' : 'text-muted hover:text-ink',
              'after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:transition-colors',
              active ? 'after:bg-accent' : 'after:bg-transparent',
            )}
          >
            {tab.label}
            {tab.count != null && <span className="tabular text-xs text-muted">{tab.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
