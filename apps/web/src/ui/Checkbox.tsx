import type { InputHTMLAttributes } from 'react';
import { cn } from './cn';

/** Флажок в цвете акцента; подпись — снаружи, через `<label>`. */
export function Checkbox({ className = '', ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type="checkbox"
      className={cn('size-4 shrink-0 cursor-pointer rounded accent-[var(--accent)]', className)}
      {...rest}
    />
  );
}
