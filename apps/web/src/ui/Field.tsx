import {
  cloneElement,
  isValidElement,
  useId,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';
import { cn } from './cn';

const control =
  'w-full rounded-lg bg-[var(--surface)] px-3 py-2 text-[var(--text)] ' +
  'ring-1 ring-[var(--line)] transition-colors outline-none ' +
  'placeholder:text-[var(--text-muted)] focus:ring-2 focus:ring-[var(--focus)]';

/**
 * Подпись поля. Настоящий `label`: с `htmlFor` читалка называет поле
 * по подписи, а клик по ней ставит курсор в поле. Без `htmlFor` она
 * работает только как обёртка — тогда лучше `<Field>` ниже.
 */
export function Label({
  children,
  hint,
  htmlFor,
}: {
  children: ReactNode;
  hint?: ReactNode;
  htmlFor?: string;
}) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-[var(--text-muted)]">
      {children}
      {hint}
    </label>
  );
}

/**
 * Подпись + поле одной парой: id рождается здесь и уходит в оба.
 * `<Field label="Почта"><Input … /></Field>` — и поле подписано
 * для читалки, и клик по подписи попадает в него.
 */
export function Field({
  label,
  hint,
  help,
  error,
  children,
  className = '',
}: {
  label: ReactNode;
  hint?: ReactNode;
  /** Пояснение под полем. */
  help?: ReactNode;
  /** Текст ошибки под полем: красный и связан с полем через aria. */
  error?: ReactNode;
  children: ReactElement<{ id?: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }>;
  className?: string;
}) {
  const generated = useId();
  const id = (isValidElement(children) && children.props.id) || generated;
  const helpId = help || error ? `${id}-help` : undefined;
  const control = isValidElement(children)
    ? cloneElement(children, {
        id,
        'aria-describedby': helpId,
        'aria-invalid': error ? true : undefined,
      })
    : children;
  return (
    <div className={className}>
      <Label htmlFor={id} hint={hint}>
        {label}
      </Label>
      {control}
      {(error || help) && (
        <p
          id={helpId}
          className={`mt-1.5 text-sm ${error ? 'text-[var(--danger)]' : 'text-[var(--text-muted)]'}`}
        >
          {error || help}
        </p>
      )}
    </div>
  );
}

export function Input({ className = '', ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(control, className)} {...rest} />;
}

export function Textarea({ className = '', ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(control, className)} {...rest} />;
}

export type ChipTone = 'neutral' | 'progress' | 'done' | 'warn' | 'error';

/**
 * Состояние выводим формой и цветом сразу — чтобы читалось не только
 * по тексту. Пять оттенков: «никак», «идёт», «готово», «требует внимания»
 * и «беда» — реестру нужно отличать замену и отзыв от простого «идёт».
 *
 * Цвета — семантические, а не оттенки одного синего: зелёный — сделано
 * и дошло, жёлтый — заменён и истёк, красный — отозван и не дошло,
 * синий — идёт. Иначе на реестре из пятидесяти строк беду от нормы
 * было не отличить.
 */
export function StatusChip({ tone, children }: { tone: ChipTone; children: ReactNode }) {
  const tones = {
    neutral: 'bg-[var(--surface-sunken)] text-[var(--text-muted)]',
    progress: 'bg-[var(--award-soft)] text-[var(--award)]',
    done: 'bg-[var(--ok-soft)] text-[var(--ok)]',
    warn: 'bg-[var(--warn-soft)] text-[var(--warn)]',
    error: 'bg-[var(--danger-soft)] text-[var(--danger)]',
  } as const;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

/**
 * Переключатель настройки.
 *
 * Подпись — часть кнопки, а не текст рядом: попасть по самому ползунку
 * с телефона трудно, а промах по настройке безопасности стоит дорого.
 *
 * Размер `lg` — для разделов в полный экран: там ползунок и подпись идут
 * в один кегль с остальными настройками, а не мельче их.
 */
const toggleSizes = {
  md: {
    track: 'h-5 w-9',
    knob: 'h-4 w-4',
    shift: 'translate-x-4',
    label: 'text-sm',
    hint: 'pl-12 text-xs',
  },
  lg: {
    track: 'h-6 w-11',
    knob: 'h-5 w-5',
    shift: 'translate-x-5',
    label: 'text-base',
    // Длинную строку пояснения подрезаем: крупный переключатель стоит
    // в широкой карточке, и текст во всю её ширину не читается.
    hint: 'max-w-3xl pl-14 text-sm',
  },
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
          className={`mt-0.5 inline-flex shrink-0 items-center rounded-full p-0.5 transition-colors ${s.track} ${
            checked ? 'bg-[var(--accent)]' : 'bg-[var(--line-strong)]'
          }`}
        >
          <span
            className={`rounded-full bg-white transition-transform ${s.knob} ${
              checked ? s.shift : ''
            }`}
          />
        </span>
        <span className={s.label}>{label}</span>
      </button>
      {hint && <p className={`mt-1 text-[var(--text-muted)] ${s.hint}`}>{hint}</p>}
    </div>
  );
}
