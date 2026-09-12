import type { ButtonHTMLAttributes } from 'react';
import { cn } from './cn';

/**
 * Кнопка из одной иконки. Доступное имя обязательно — оно же подсказка.
 * 44 точки на тач-экране, 36 на десктопе: ниже — в палец не попасть.
 */
export function IconButton({
  label,
  active,
  size = 'md',
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  active?: boolean;
  size?: 'sm' | 'md';
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={cn(
        'grid shrink-0 place-items-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text)] disabled:opacity-40 disabled:hover:bg-transparent',
        size === 'sm' ? 'size-8' : 'size-11 md:size-9',
        active && 'bg-[var(--accent-soft)] text-[var(--accent)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
