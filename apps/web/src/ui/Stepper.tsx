import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ChevronDown, TriangleAlert } from 'lucide-react';
import { BottomSheet } from './BottomSheet';
import { cn } from './cn';

export type StepState = 'done' | 'current' | 'todo' | 'warn';

export interface StepItem {
  id: string;
  label: string;
  to: string;
  state: StepState;
  /** Одна строка под названием на телефоне: «12 строк», «не задано». */
  hint?: string;
}

/**
 * Шаги одного пути — Лист → Получатели → Проверка → Письмо → Выпуск.
 *
 * Не вкладки: у вкладок порядка нет, а здесь он и есть смысл. Пройденный
 * шаг отмечен галочкой, текущий залит, будущий — контуром; шаг с
 * замечаниями — жёлтым знаком. Все шаги остаются ссылками: возвращаться
 * можно куда угодно.
 *
 * На телефоне в строку пять подписей не помещаются: остаётся одна
 * кнопка «Шаг 2 из 5 · Получатели», а список открывается нижним листом.
 */
export function Stepper({
  steps,
  label = 'Шаги выпуска',
  className = '',
}: {
  steps: StepItem[];
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const current = Math.max(0, steps.findIndex((s) => s.state === 'current'));
  const step = steps[current];

  return (
    <nav aria-label={label} className={cn('min-w-0', className)}>
      <ol className="hidden items-center gap-1 md:flex">
        {steps.map((s, i) => (
          <li key={s.id} className="flex items-center">
            <Link
              to={s.to}
              aria-current={s.state === 'current' ? 'step' : undefined}
              className={cn(
                'pressable flex h-8 items-center gap-2 rounded-control px-2 text-sm whitespace-nowrap',
                s.state === 'current' ? 'font-medium text-ink' : 'text-muted hover:bg-sunken hover:text-ink',
              )}
            >
              <Dot index={i} state={s.state} />
              {s.label}
            </Link>
            {i < steps.length - 1 && <span aria-hidden className="mx-0.5 h-px w-4 bg-line" />}
          </li>
        ))}
      </ol>

      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="pressable flex h-10 max-w-full items-center gap-2 rounded-control px-2 text-sm md:hidden"
      >
        {step && <Dot index={current} state={step.state} />}
        <span className="truncate">
          <span className="text-muted">
            Шаг {current + 1} из {steps.length} ·{' '}
          </span>
          <span className="font-medium">{step?.label}</span>
        </span>
        <ChevronDown size={16} aria-hidden className="shrink-0 text-muted" />
      </button>

      <BottomSheet open={open} onClose={() => setOpen(false)} title={label}>
        <ol className="flex flex-col gap-1 px-1">
          {steps.map((s, i) => (
            <li key={s.id}>
              <Link
                to={s.to}
                onClick={() => setOpen(false)}
                aria-current={s.state === 'current' ? 'step' : undefined}
                className={cn(
                  'flex min-h-12 items-center gap-3 rounded-card px-3 py-2 text-base',
                  s.state === 'current' ? 'bg-accent-soft font-medium text-accent' : 'text-ink active:bg-sunken',
                )}
              >
                <Dot index={i} state={s.state} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{s.label}</span>
                  {s.hint && <span className="block text-sm text-muted">{s.hint}</span>}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </BottomSheet>
    </nav>
  );
}

function Dot({ index, state }: { index: number; state: StepState }) {
  return (
    <span
      aria-hidden
      className={cn(
        'grid size-5 shrink-0 place-items-center rounded-full text-[11px] leading-none font-semibold tabular-nums',
        state === 'done' && 'bg-accent text-on-accent',
        state === 'current' && 'bg-accent text-on-accent ring-4 ring-accent-soft',
        state === 'todo' && 'text-muted ring-1 ring-line-strong',
        state === 'warn' && 'bg-warn-soft text-warn',
      )}
    >
      {state === 'done' ? (
        <Check size={12} strokeWidth={3} />
      ) : state === 'warn' ? (
        <TriangleAlert size={11} strokeWidth={2.5} />
      ) : (
        index + 1
      )}
    </span>
  );
}
