import type { ReactNode } from 'react';
import { cn } from './cn';

/** Клавиша в подсказке: на сенсорном экране клавиатуры нет — и её нет. */
export function Kbd({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        'rounded-[4px] bg-sunken px-1.5 py-0.5 font-mono text-[11px] leading-none text-muted ring-1 ring-line pointer-coarse:hidden',
        className,
      )}
    >
      {children}
    </kbd>
  );
}
