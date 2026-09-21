import type { ButtonHTMLAttributes, KeyboardEventHandler, MouseEventHandler, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { LoaderCircle } from 'lucide-react';
import { cn } from './cn';
import { useTooltip } from './Tooltip';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'link';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Значок слева от подписи; у `iconOnly` — единственное содержимое. */
  icon?: ReactNode;
  /**
   * Кнопка из одного значка: квадратная, без подписи. Доступное имя
   * обязательно — оно же становится подсказкой.
   */
  iconOnly?: boolean;
  label?: string;
  /** Идёт запрос: вместо значка крутится индикатор, кнопка недоступна, ширина не прыгает. */
  loading?: boolean;
  /** Включённое состояние переключателя на панели — `aria-pressed`. */
  active?: boolean;
  /** Ссылка вместо кнопки — теми же классами. */
  to?: string;
}

/*
 * Высоты 32 / 40 / 48: контрол в строке таблицы, обычный, на телефоне
 * под палец. Крупный ещё и в разделах, набранных в 16 точек, — там кнопка
 * с текстом в 14 выпадала из строки.
 *
 * Мелкий под пальцем подрастает до 44: он стоит в панелях редактора и
 * в строках таблицы, где соседи в паре точек, и 32 точки — это промах
 * по соседней кнопке. По ширине он остаётся прежним, растёт только
 * высота: ряды кнопок от этого не переносятся.
 */
const sizes: Record<ButtonSize, { text: string; icon: string }> = {
  sm: { text: 'h-8 gap-1.5 px-3 text-sm pointer-coarse:h-11', icon: 'size-8' },
  md: { text: 'h-10 gap-2 px-4 text-sm', icon: 'size-10' },
  lg: { text: 'h-12 gap-2 px-5 text-base', icon: 'size-12' },
};

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-accent-button text-on-accent hover:bg-accent-button-hover',
  secondary: 'bg-surface text-ink ring-1 ring-line hover:bg-sunken',
  ghost: 'text-muted hover:bg-sunken hover:text-ink',
  danger: 'text-danger ring-1 ring-danger/40 hover:bg-danger-soft',
  link: 'h-auto px-0 text-accent underline-offset-4 hover:underline',
};

/*
 * Включённый переключатель подсвечен акцентом — и остаётся таким
 * под указателем, иначе кнопка «моргала» бы при наведении.
 */
const pressed = 'bg-accent-soft text-accent hover:bg-accent-soft hover:text-accent';

/**
 * Кнопка — одна на кабинет.
 *
 * Отвечает на нажатие телом (`pressable`: лёгкое сжатие на :active) —
 * единственная обратная связь, которая читается и на телефоне.
 *
 * `title` не уходит в разметку, а становится своей подсказкой: через
 * `...rest` он раньше протекал в DOM, и рядом с кнопкой всплывала
 * системная плашка. Выключенная кнопка событий указателя не получает,
 * поэтому «почему недоступно» вешается снаружи обёрткой `<Tooltip>`.
 */
export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  iconOnly = false,
  label,
  loading = false,
  active,
  to,
  children,
  className = '',
  title,
  type = 'button',
  disabled,
  ...rest
}: ButtonProps) {
  const tip = useTooltip(disabled ? undefined : (title ?? (iconOnly ? label : undefined)));
  const isDisabled = disabled || loading;

  const cls = cn(
    'pressable inline-flex shrink-0 items-center justify-center rounded-control font-medium whitespace-nowrap select-none',
    'disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100',
    iconOnly ? sizes[size].icon : sizes[size].text,
    variants[variant],
    active && pressed,
    loading && 'cursor-progress',
    className,
  );

  const content = (
    <>
      {loading ? (
        <LoaderCircle aria-hidden size={size === 'lg' ? 20 : 16} className="animate-spin" />
      ) : (
        icon
      )}
      {!iconOnly && children}
      {tip.tooltip}
    </>
  );

  if (to && !isDisabled) {
    const { onClick, onKeyDown, id, style } = rest;
    return (
      <Link
        to={to}
        id={id}
        style={style}
        className={cls}
        aria-label={iconOnly ? label : rest['aria-label']}
        aria-current={active ? 'page' : undefined}
        onClick={onClick as unknown as MouseEventHandler<HTMLAnchorElement>}
        onKeyDown={onKeyDown as unknown as KeyboardEventHandler<HTMLAnchorElement>}
        {...tip.triggerProps}
      >
        {content}
      </Link>
    );
  }

  return (
    <button
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      aria-pressed={active}
      aria-label={iconOnly ? label : rest['aria-label']}
      className={cls}
      {...rest}
      {...tip.triggerProps}
    >
      {content}
    </button>
  );
}
