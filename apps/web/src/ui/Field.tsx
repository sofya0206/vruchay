import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { cn } from './cn';

const control =
  'w-full rounded-lg bg-[var(--surface)] px-3 py-2 text-[var(--text)] ' +
  'ring-1 ring-[var(--line)] transition-colors outline-none ' +
  'placeholder:text-[var(--text-muted)] focus:ring-2 focus:ring-[var(--focus)]';

export function Label({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <span className="mb-1.5 block text-sm font-medium text-[var(--text-muted)]">
      {children}
      {hint}
    </span>
  );
}

export function Input({ className = '', ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(control, className)} {...rest} />;
}

export function Textarea({ className = '', ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(control, className)} {...rest} />;
}

export function Select({ className = '', ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(control, className)} {...rest} />;
}

/** Состояние выводим формой и цветом сразу — чтобы читалось не только по тексту. */
export function StatusChip({
  tone,
  children,
}: {
  tone: 'neutral' | 'progress' | 'done' | 'error';
  children: ReactNode;
}) {
  const tones = {
    neutral: 'bg-[var(--surface-sunken)] text-[var(--text-muted)]',
    progress: 'bg-[var(--award-soft)] text-[var(--award)]',
    done: 'bg-[var(--accent-soft)] text-[var(--accent)]',
    error: 'bg-[var(--danger-soft)] text-[var(--danger)]',
  } as const;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${tones[tone]}`}
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
 */
export function Toggle({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: ReactNode;
  hint?: ReactNode;
  disabled?: boolean;
}) {
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
          className={`mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors ${
            checked ? 'bg-[var(--accent)]' : 'bg-[var(--line-strong)]'
          }`}
        >
          <span
            className={`h-4 w-4 rounded-full bg-white transition-transform ${
              checked ? 'translate-x-4' : ''
            }`}
          />
        </span>
        <span className="text-sm">{label}</span>
      </button>
      {hint && <p className="mt-1 pl-12 text-xs text-[var(--text-muted)]">{hint}</p>}
    </div>
  );
}
