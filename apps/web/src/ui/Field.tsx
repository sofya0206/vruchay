import {
  cloneElement,
  isValidElement,
  useId,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';
import { Badge, type BadgeTone } from './Badge';
import { cn } from './cn';

/**
 * Один класс на все поля: высота 40, скругление контрола, волосяная
 * рамка, фокус — кольцо цвета фокуса, ошибка — красная рамка.
 * `w-full` — умолчание, которое снаружи заменяют через `cn`.
 */
export const control =
  'h-10 w-full rounded-control bg-surface px-3 text-sm text-ink ring-1 ring-line outline-none ' +
  'transition-[box-shadow,background-color] placeholder:text-muted ' +
  'focus-visible:ring-2 focus-visible:ring-focus aria-invalid:ring-danger ' +
  'disabled:cursor-not-allowed disabled:opacity-50';

/** Поле в строке таблицы или на панели: ниже и теснее. */
export const controlCompact = 'h-8 px-2.5';

/**
 * Подпись поля. Настоящий `label`: с `htmlFor` читалка называет поле
 * по подписи, а клик по ней ставит курсор в поле.
 */
export function Label({
  children,
  hint,
  htmlFor,
  required,
  className = '',
}: {
  children: ReactNode;
  hint?: ReactNode;
  htmlFor?: string;
  required?: boolean;
  className?: string;
}) {
  return (
    <label htmlFor={htmlFor} className={cn('mb-1.5 block text-sm font-medium text-muted', className)}>
      {children}
      {required && (
        <span aria-hidden className="text-danger">
          {' '}
          *
        </span>
      )}
      {hint}
    </label>
  );
}

/**
 * Подпись + поле одной парой: id рождается здесь и уходит в оба.
 * `<Field label="Почта"><Input … /></Field>` — и поле подписано
 * для читалки, и клик по подписи попадает в него.
 *
 * `layout="inline"` — подпись слева, поле справа: для длинных форм
 * настроек на широком экране, где стопка подписей растягивает страницу.
 */
export function Field({
  label,
  hint,
  help,
  error,
  required,
  layout = 'stack',
  children,
  className = '',
}: {
  label: ReactNode;
  hint?: ReactNode;
  /** Пояснение под полем. */
  help?: ReactNode;
  /** Текст ошибки под полем: красный и связан с полем через aria. */
  error?: ReactNode;
  required?: boolean;
  layout?: 'stack' | 'inline';
  children: ReactElement<{ id?: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }>;
  className?: string;
}) {
  const generated = useId();
  const id = (isValidElement(children) && children.props.id) || generated;
  const helpId = help || error ? `${id}-help` : undefined;
  const field = isValidElement(children)
    ? cloneElement(children, {
        id,
        'aria-describedby': helpId,
        'aria-invalid': error ? true : undefined,
      })
    : children;
  const note = (error || help) && (
    <p id={helpId} className={cn('mt-1.5 text-sm', error ? 'text-danger' : 'text-muted')}>
      {error || help}
    </p>
  );

  if (layout === 'inline') {
    return (
      <div className={cn('grid gap-1.5 sm:grid-cols-[minmax(10rem,1fr)_2fr] sm:items-start sm:gap-6', className)}>
        <Label htmlFor={id} hint={hint} required={required} className="sm:mb-0 sm:pt-2.5">
          {label}
        </Label>
        <div>
          {field}
          {note}
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <Label htmlFor={id} hint={hint} required={required}>
        {label}
      </Label>
      {field}
      {note}
    </div>
  );
}

export function Input({
  className = '',
  compact,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { compact?: boolean }) {
  return <input className={cn(control, compact && controlCompact, className)} {...rest} />;
}

export function Textarea({ className = '', ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(control, 'h-auto min-h-24 py-2', className)} {...rest} />;
}

export type ChipTone = 'neutral' | 'progress' | 'done' | 'warn' | 'error';

const chipTones: Record<ChipTone, BadgeTone> = {
  neutral: 'neutral',
  progress: 'info',
  done: 'ok',
  warn: 'warn',
  error: 'danger',
};

/** Прежнее имя метки состояния — теперь это `Badge`. */
export function StatusChip({ tone, children }: { tone: ChipTone; children: ReactNode }) {
  return <Badge tone={chipTones[tone]}>{children}</Badge>;
}

/**
 * Переключатель настройки.
 *
 * Подпись — часть кнопки, а не текст рядом: попасть по самому ползунку
 * с телефона трудно, а промах по настройке безопасности стоит дорого.
 * Дорожка 24 точки в высоту — цель, в которую попадают пальцем.
 */
const toggleSizes = {
  md: { label: 'text-sm', hint: 'pl-14 text-xs' },
  lg: { label: 'text-base', hint: 'max-w-3xl pl-14 text-sm' },
} as const;

export function Toggle({
  checked,
  onChange,
  label,
  hint,
  disabled,
  size = 'md',
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: ReactNode;
  hint?: ReactNode;
  disabled?: boolean;
  size?: keyof typeof toggleSizes;
}) {
  const s = toggleSizes[size];

  return (
    <div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className="flex w-full items-start gap-3 text-left disabled:opacity-50"
      >
        <span
          aria-hidden
          className={cn(
            'mt-px inline-flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors',
            checked ? 'bg-accent' : 'bg-line-strong',
          )}
        >
          <span
            className={cn(
              'size-5 rounded-full bg-white shadow-sm transition-transform duration-180',
              checked && 'translate-x-5',
            )}
          />
        </span>
        <span className={cn('pt-0.5', s.label)}>{label}</span>
      </button>
      {hint && <p className={cn('mt-1 text-muted', s.hint)}>{hint}</p>}
    </div>
  );
}
