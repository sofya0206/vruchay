import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { useTooltip } from './Tooltip';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
}

const base =
  'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors ' +
  'disabled:cursor-not-allowed disabled:opacity-50';

/*
 * Крупный размер заведён для разделов, переведённых на полный экран:
 * там подписи набраны в 16 точек, и кнопка с текстом в 14 выпадала
 * из строки соседним мелким шрифтом.
 */
const sizes: Record<Size, string> = {
  sm: 'px-2.5 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-2.5 text-base',
};

const variants: Record<Variant, string> = {
  primary: 'bg-[var(--accent)] text-[var(--accent-contrast)] hover:bg-[var(--accent-hover)]',
  secondary:
    'bg-[var(--surface)] text-[var(--text)] ring-1 ring-[var(--line)] hover:bg-[var(--surface-sunken)]',
  ghost: 'text-[var(--text-muted)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text)]',
  danger: 'text-[var(--danger)] ring-1 ring-[var(--danger)]/40 hover:bg-[var(--danger-soft)]',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  children,
  className = '',
  title,
  ...rest
}: Props) {
  /*
   * `title` не уходит в разметку, а становится своей подсказкой: через
   * `...rest` он раньше протекал в DOM с любой кнопки, и рядом с кнопкой
   * всплывала системная плашка — та самая, от которой уходим.
   *
   * Выключенная кнопка событий указателя не получает, поэтому объяснение
   * «почему недоступно» вешается снаружи, обёрткой `<Tooltip>`, — здесь
   * его показать нечем.
   */
  const { triggerProps, tooltip } = useTooltip(rest.disabled ? undefined : title);

  return (
    <button
      className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}
      {...rest}
      {...triggerProps}
    >
      {icon}
      {children}
      {tooltip}
    </button>
  );
}
