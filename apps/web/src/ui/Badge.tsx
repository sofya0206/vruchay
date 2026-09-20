import type { ReactNode } from 'react';
import { cn } from './cn';

export type BadgeTone = 'neutral' | 'info' | 'ok' | 'warn' | 'danger' | 'accent';

const tones: Record<BadgeTone, string> = {
  neutral: 'bg-sunken text-muted',
  info: 'bg-info-soft text-info',
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  danger: 'bg-danger-soft text-danger',
  accent: 'bg-accent-soft text-accent',
};

/**
 * Метка состояния: форма и цвет сразу, чтобы читалось не только текстом.
 *
 * Цвета семантические, а не оттенки одного синего: зелёный — сделано
 * и дошло, жёлтый — заменён и истёк, красный — отозван и не дошло,
 * синий — идёт. На реестре из пятидесяти строк беду от нормы иначе
 * не отличить. Точка — когда текста рядом нет, а состояние показать надо.
 */
export function Badge({
  tone = 'neutral',
  size = 'md',
  dot = false,
  children,
  className = '',
}: {
  tone?: BadgeTone;
  size?: 'sm' | 'md';
  dot?: boolean;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full font-medium whitespace-nowrap',
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs',
        tones[tone],
        className,
      )}
    >
      {dot && <span aria-hidden className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}
