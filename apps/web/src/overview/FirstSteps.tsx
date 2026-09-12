import { Link } from 'react-router-dom';
import { ArrowRight, Check, X } from 'lucide-react';
import type { Overview } from '../api/overview';
import { Card } from '../ui/Card';
import { firstSteps } from './desk';

/**
 * Первые шаги — три строки с галочками вместо слайдера с обучением.
 *
 * Слайдер рассказывал, как устроен сервис, и уводил; после него человек
 * всё равно попадал на пустые списки и искал, куда нажать. Здесь список
 * того, что надо сделать, каждая строка — дверь в нужное место, и сделанное
 * отмечается само. Когда все три пройдены, блок уходит.
 */
export function FirstSteps({ data, onHide }: { data: Overview; onHide: () => void }) {
  const steps = firstSteps(data);
  const done = steps.filter((s) => s.done).length;

  return (
    <Card
      title="Первые шаги"
      about={`${done} из ${steps.length}`}
      action={
        <button
          type="button"
          onClick={onHide}
          aria-label="Скрыть первые шаги"
          title="Скрыть"
          className="grid h-9 w-9 place-items-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text)]"
        >
          <X size={18} />
        </button>
      }
    >
      <ol className="grid gap-2 sm:grid-cols-3">
        {steps.map((step, i) => (
          <li key={step.id}>
            <Link
              to={step.to}
              className={
                'flex h-full items-start gap-3 rounded-xl p-4 transition-colors ' +
                (step.done
                  ? 'bg-[var(--surface-sunken)] text-[var(--text-muted)]'
                  : 'ring-1 ring-[var(--line)] hover:bg-[var(--accent-soft)]')
              }
            >
              <span
                aria-hidden
                className={
                  'grid size-8 shrink-0 place-items-center rounded-full text-sm font-medium ' +
                  (step.done
                    ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                    : 'bg-[var(--accent-soft)] text-[var(--accent)]')
                }
              >
                {step.done ? <Check size={16} strokeWidth={2.5} /> : i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className={'block font-medium ' + (step.done ? 'line-through' : '')}>
                  {step.label}
                </span>
                <span className="mt-0.5 block text-sm text-[var(--text-muted)]">{step.hint}</span>
              </span>
              {!step.done && (
                <ArrowRight size={16} className="mt-1 shrink-0 text-[var(--text-muted)]" />
              )}
            </Link>
          </li>
        ))}
      </ol>
    </Card>
  );
}
