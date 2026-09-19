import { cn } from '../ui/cn';

/**
 * Бейдж HTTP-метода. Цвета — из семантических токенов кита: чтение
 * зелёным, создание синим, изменение жёлтым, удаление красным.
 * Так размечают справочники Mintlify и ReadMe; DELETE сокращён
 * до DEL, чтобы колонка не расползалась.
 */
const TONE: Record<string, string> = {
  GET: 'bg-[var(--ok-soft)] text-[var(--ok)]',
  POST: 'bg-[var(--accent-soft)] text-[var(--accent)]',
  PUT: 'bg-[var(--warn-soft)] text-[var(--warn)]',
  PATCH: 'bg-[var(--warn-soft)] text-[var(--warn)]',
  DELETE: 'bg-[var(--danger-soft)] text-[var(--danger)]',
};

export function methodLabel(method: string): string {
  return method === 'DELETE' ? 'DEL' : method;
}

export function MethodPill({ method, size = 'sm' }: { method: string; size?: 'sm' | 'md' }) {
  return (
    <span
      className={cn(
        'inline-block shrink-0 rounded-md text-center font-mono font-bold tracking-wide',
        size === 'sm' ? 'min-w-[2.6rem] px-1 py-px text-[0.6rem] leading-4' : 'px-1.5 py-0.5 text-xs',
        TONE[method] ?? 'bg-[var(--surface-sunken)] text-[var(--text-muted)]',
      )}
    >
      {methodLabel(method)}
    </span>
  );
}
