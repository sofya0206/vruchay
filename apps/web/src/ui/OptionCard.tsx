import type { ButtonHTMLAttributes, KeyboardEvent, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from './cn';

/**
 * Группа вариантов-карточек: один выбор из нескольких.
 *
 * `role="radiogroup"`, стрелки ходят по вариантам, Tab заходит один раз —
 * как у настоящих радиокнопок. Вариант — `OptionCard`.
 */
export function OptionGroup({
  label,
  children,
  className = '',
  columns = 'auto',
}: {
  label: string;
  children: ReactNode;
  className?: string;
  /** Раскладка: в столбик или плиткой. */
  columns?: 'auto' | 1 | 2 | 3;
}) {
  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(e.key)) return;
    const radios = Array.from(
      e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]:not(:disabled)'),
    );
    const at = radios.findIndex((el) => el === document.activeElement);
    if (at < 0) return;
    e.preventDefault();
    const forward = e.key === 'ArrowRight' || e.key === 'ArrowDown';
    const next = radios[(at + (forward ? 1 : radios.length - 1)) % radios.length];
    next.focus();
    next.click();
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKey}
      className={cn(
        'grid gap-3',
        columns === 'auto' && '[grid-template-columns:repeat(auto-fill,minmax(14rem,1fr))]',
        columns === 1 && 'grid-cols-1',
        columns === 2 && 'sm:grid-cols-2',
        columns === 3 && 'sm:grid-cols-3',
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * Вариант выбора карточкой: значок, название, одна строка объяснения.
 *
 * Один компонент вместо шести самодельных: режим выпуска, вид рассылки,
 * тема кабинета, готовый набор правил, стартовая плитка листа, шаблон
 * нового документа. Выбранный — залит мягким акцентом и обведён.
 */
export function OptionCard({
  icon: Icon,
  title,
  description,
  selected = false,
  onSelect,
  disabled,
  trailing,
  dropzone = false,
  className = '',
  children,
  ...rest
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'title' | 'onSelect'> & {
  icon?: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  selected?: boolean;
  onSelect?: () => void;
  /** Что стоит справа: метка, число, стрелка. */
  trailing?: ReactNode;
  /** Принимает перетащенный файл: пунктирная рамка вместо сплошной. */
  dropzone?: boolean;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      tabIndex={selected ? 0 : -1}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        'pressable flex w-full items-start gap-3 rounded-card bg-surface p-4 text-left ring-1 ring-line',
        'hover:ring-line-strong disabled:cursor-not-allowed disabled:opacity-50',
        selected && 'bg-accent-soft ring-2 ring-accent hover:ring-accent',
        dropzone && !selected && 'ring-0 outline-2 -outline-offset-2 outline-dashed outline-line-strong',
        className,
      )}
      {...rest}
    >
      {Icon && (
        <span
          className={cn(
            'grid size-10 shrink-0 place-items-center rounded-control',
            selected ? 'bg-surface text-accent' : 'bg-sunken text-accent',
          )}
        >
          <Icon size={20} strokeWidth={1.75} aria-hidden />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{title}</span>
        {description && <span className="mt-0.5 block text-sm text-muted">{description}</span>}
        {children}
      </span>
      {trailing && <span className="shrink-0 text-sm text-muted">{trailing}</span>}
    </button>
  );
}
