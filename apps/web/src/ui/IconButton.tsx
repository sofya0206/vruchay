import type { ButtonHTMLAttributes } from 'react';
import { cn } from './cn';
import { useTooltip } from './Tooltip';

/**
 * Кнопка из одной иконки. Доступное имя обязательно — оно же подсказка.
 * 44 точки на тач-экране, 36 на десктопе: ниже — в палец не попасть.
 *
 * Подсказка своя, а не браузерная: у значка без подписи она единственное
 * объяснение, и появляться оно должно предсказуемо, а не через секунду
 * с лишним и по-разному в каждом браузере. Скринридеру её не читаем —
 * тот же текст он уже получил из `aria-label`.
 */
export function IconButton({
  label,
  active,
  size = 'md',
  className = '',
  children,
  // Браузерную подсказку не пропускаем дальше, даже если её передали
  // снаружи: две подсказки на одной кнопке — это и есть та системная
  // плашка, от которой уходим.
  title: _ignored,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  active?: boolean;
  size?: 'sm' | 'md';
}) {
  const { triggerProps, tooltip } = useTooltip(label);

  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      className={cn(
        'grid shrink-0 place-items-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text)] disabled:opacity-40 disabled:hover:bg-transparent',
        size === 'sm' ? 'size-8' : 'size-11 md:size-9',
        active && 'bg-[var(--accent-soft)] text-[var(--accent)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]',
        className,
      )}
      {...rest}
      {...triggerProps}
    >
      {children}
      {tooltip}
    </button>
  );
}
