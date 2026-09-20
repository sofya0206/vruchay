import { cn } from './cn';

const sizes = {
  sm: 'size-6 text-[10px]',
  md: 'size-8 text-xs',
  lg: 'size-10 text-sm',
} as const;

/** Первая буква имени или почты — так человека узнают в списке. */
export function initialOf(name?: string | null, email?: string | null): string {
  const source = (name ?? '').trim() || (email ?? '').trim();
  return source ? source[0].toUpperCase() : '?';
}

/**
 * Аватар из буквы на акцентной подложке. Без радуги случайных цветов:
 * в команде из пяти человек она ничего не различает, а в интерфейсе
 * появляется шестой цвет, которого в системе нет.
 */
export function Avatar({
  name,
  email,
  size = 'md',
  className = '',
}: {
  name?: string | null;
  email?: string | null;
  size?: keyof typeof sizes;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'grid shrink-0 place-items-center rounded-full bg-accent-soft font-medium text-accent select-none',
        sizes[size],
        className,
      )}
    >
      {initialOf(name, email)}
    </span>
  );
}
