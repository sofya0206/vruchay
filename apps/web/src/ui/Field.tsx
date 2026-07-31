import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';

const control =
  'w-full rounded-lg bg-[var(--surface)] px-3 py-2 text-[var(--text)] ' +
  'ring-1 ring-[var(--line-strong)] transition-colors outline-none ' +
  'placeholder:text-[var(--text-muted)] focus:ring-2 focus:ring-[var(--focus)]';

export function Label({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <span className="mb-1.5 block text-xs font-medium tracking-wide text-[var(--text-muted)] uppercase">
      {children}
      {hint}
    </span>
  );
}

export function Input({ className = '', ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${control} ${className}`} {...rest} />;
}

export function Textarea({ className = '', ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`${control} ${className}`} {...rest} />;
}

export function Select({ className = '', ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`${control} ${className}`} {...rest} />;
}

/** Состояние выводим формой и цветом сразу — чтобы читалось не только по тексту. */
export function StatusChip({
  tone,
  children,
}: {
  tone: 'neutral' | 'progress' | 'done';
  children: ReactNode;
}) {
  const tones = {
    neutral: 'bg-[var(--surface-sunken)] text-[var(--text-muted)]',
    progress: 'bg-[var(--award-soft)] text-[var(--award)]',
    done: 'bg-[var(--accent-soft)] text-[var(--accent)]',
  } as const;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}
