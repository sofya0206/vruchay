import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Check, CircleAlert, Info, TriangleAlert, X } from 'lucide-react';
import { cn } from './cn';

export type ToastTone = 'neutral' | 'ok' | 'warn' | 'danger';

export interface ToastOptions {
  title: ReactNode;
  description?: ReactNode;
  tone?: ToastTone;
  /** Одно действие справа: «Показать пропущенные», «Отменить». */
  action?: { label: string; onClick: () => void };
  /** Сколько висит, мс. Ошибки по умолчанию дольше. */
  duration?: number;
}

interface ToastItem extends ToastOptions {
  id: number;
}

const MAX = 3;
const EXIT_MS = 150;

/*
 * Хранилище вне React: `toast(...)` зовут из обработчиков запросов,
 * где нет ни хуков, ни контекста. Тот же приём, что у обучения
 * (onboarding/store.ts).
 */
let items: ToastItem[] = [];
let seq = 0;
const listeners = new Set<() => void>();

function emit() {
  for (const fn of listeners) fn();
}

export function toast(options: ToastOptions): number {
  const id = ++seq;
  items = [...items.slice(-(MAX - 1)), { ...options, id }];
  emit();
  return id;
}

export function dismissToast(id: number): void {
  if (!items.some((t) => t.id === id)) return;
  items = items.filter((t) => t.id !== id);
  emit();
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useToasts(): ToastItem[] {
  return useSyncExternalStore(subscribe, () => items, () => items);
}

const icons: Record<ToastTone, ReactNode> = {
  neutral: <Info size={18} className="text-accent" />,
  ok: <Check size={18} className="text-ok" />,
  warn: <TriangleAlert size={18} className="text-warn" />,
  danger: <CircleAlert size={18} className="text-danger" />,
};

/**
 * Уведомления — коротко, в углу, сами уходят.
 *
 * Для итогов действий, которые не нужно читать дважды: «Сохранено»,
 * «Скопировано», «Отправлено 40 писем». Ошибка запроса тоже сюда, но
 * живёт дольше и читается вслух как alert. Не для того, что требует
 * решения, — на это есть окно.
 *
 * Не больше трёх разом: четвёртое вытесняет самое старое. Под указателем
 * таймер стоит — человек читает. На телефоне стоят над прижатой панелью.
 */
export function Toaster() {
  const list = useToasts();
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+5rem)] z-[70] flex flex-col items-stretch gap-2 md:inset-x-auto md:bottom-6 md:left-6 md:w-96"
    >
      {list.map((t) => (
        <ToastCard key={t.id} item={t} />
      ))}
    </div>
  );
}

function ToastCard({ item }: { item: ToastItem }) {
  const [shown, setShown] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const paused = useRef(false);
  const duration = item.duration ?? (item.tone === 'danger' ? 8000 : 5000);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    let left = duration;
    let last = Date.now();
    const tick = setInterval(() => {
      const now = Date.now();
      if (!paused.current) left -= now - last;
      last = now;
      if (left <= 0) {
        clearInterval(tick);
        close();
      }
    }, 100);
    return () => clearInterval(tick);
  }, []);

  function close() {
    setLeaving(true);
    setTimeout(() => dismissToast(item.id), EXIT_MS);
  }

  return (
    <div
      role={item.tone === 'danger' ? 'alert' : 'status'}
      onPointerEnter={() => (paused.current = true)}
      onPointerLeave={() => (paused.current = false)}
      className={cn(
        'pointer-events-auto flex items-start gap-3 rounded-card bg-raised p-3 pr-2 text-sm shadow-lg ring-1 ring-line',
      )}
      style={{
        opacity: shown && !leaving ? 1 : 0,
        transform: shown && !leaving ? 'none' : 'translateY(8px)',
        transition: `opacity ${leaving ? EXIT_MS : 180}ms var(--ease-out), transform ${leaving ? EXIT_MS : 180}ms var(--ease-out)`,
      }}
    >
      <span aria-hidden className="mt-0.5 shrink-0">
        {icons[item.tone ?? 'neutral']}
      </span>
      <div className="min-w-0 flex-1 py-0.5">
        <p className="font-medium">{item.title}</p>
        {item.description && <p className="mt-0.5 text-muted">{item.description}</p>}
      </div>
      {item.action && (
        <button
          type="button"
          onClick={() => {
            item.action?.onClick();
            close();
          }}
          className="pressable shrink-0 rounded-control px-2.5 py-1.5 text-sm font-medium text-accent hover:bg-accent-soft"
        >
          {item.action.label}
        </button>
      )}
      <button
        type="button"
        aria-label="Закрыть"
        onClick={close}
        className="pressable grid size-8 shrink-0 place-items-center rounded-control text-muted hover:bg-sunken hover:text-ink"
      >
        <X size={16} />
      </button>
    </div>
  );
}
