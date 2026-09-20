import type { ReactNode } from 'react';
import { Check, Minus, X } from 'lucide-react';
import { cn } from './cn';

/**
 * Итог пакетной операции: сделано, не вышло, пропущено.
 *
 * Три цветных счётчика вместо фразы «выпущено 287, ошибок 13».
 * Числа читаются с расстояния, слова только подписывают. Цвет
 * дублируется знаком, чтобы различалось и без цвета.
 */
export function Outcome({
  done,
  failed = 0,
  skipped = 0,
  doneLabel = 'готово',
  failedLabel = 'с ошибками',
  skippedLabel = 'пропущено',
  action,
  className = '',
}: {
  done: number;
  failed?: number;
  skipped?: number;
  doneLabel?: string;
  failedLabel?: string;
  skippedLabel?: string;
  /** Кнопка справа: «Показать 13 строк», «Скачать». */
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-center gap-x-6 gap-y-3', className)}>
      <Counter n={done} label={doneLabel} tone="ok" icon={<Check size={14} strokeWidth={3} />} />
      {failed > 0 && (
        <Counter
          n={failed}
          label={failedLabel}
          tone="danger"
          icon={<X size={14} strokeWidth={3} />}
        />
      )}
      {skipped > 0 && (
        <Counter
          n={skipped}
          label={skippedLabel}
          tone="warn"
          icon={<Minus size={14} strokeWidth={3} />}
        />
      )}
      {action && <div className="ml-auto flex gap-2">{action}</div>}
    </div>
  );
}

const tones = {
  ok: 'bg-ok-soft text-ok',
  danger: 'bg-danger-soft text-danger',
  warn: 'bg-warn-soft text-warn',
} as const;

function Counter({
  n,
  label,
  tone,
  icon,
}: {
  n: number;
  label: string;
  tone: keyof typeof tones;
  icon: ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={cn('grid size-6 place-items-center rounded-full', tones[tone])}>{icon}</span>
      <span className="tabular text-xl font-medium leading-none">{n}</span>
      <span className="text-sm text-muted">{label}</span>
    </span>
  );
}
