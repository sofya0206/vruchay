import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import type { Overview } from '../api/overview';
import { Button } from '../ui/Button';
import { cn } from '../ui/cn';
import { flowSteps, type StepState } from './desk';
import { protocolTitle } from './format';
import { useCreateMaterial } from './useCreateMaterial';

/**
 * Путь награждения: документ → список → письма.
 *
 * Это и есть ответ на «что здесь делать»: три шага в том порядке,
 * в каком они идут, с отметкой, где организация сейчас. Единственная
 * залитая кнопка главной живёт здесь — «Создать документ». Всё остальное
 * на странице — ссылки и контурные кнопки, иначе главной кнопки нет.
 *
 * Полоса не исчезает у опытных: пройденные шаги ведут в свои разделы
 * в рабочем порядке, и это быстрее, чем искать их в полосе разделов.
 */
export function Flow({ data }: { data: Overview }) {
  const create = useCreateMaterial();
  const [first, second, third] = flowSteps(data);
  const last = data.documents[0];

  return (
    <section
      aria-label="Путь награждения"
      className="grid gap-3 rounded-[var(--radius-card)] bg-[var(--surface)] p-4 shadow-[var(--ring-line)] md:grid-cols-[auto_1fr_1fr_1fr] md:items-center"
    >
      <div className="flex flex-col gap-3 md:min-w-56 md:border-r md:border-[var(--line)] md:pr-5">
        <div>
          <h2 className="text-base font-medium">Выпустить награждение</h2>
          <p className="text-sm text-[var(--text-muted)]">Три шага, каждый раз одни и те же</p>
        </div>
        <Button
          variant="primary"
          icon={<Plus size={16} />}
          disabled={create.isPending}
          onClick={() => create.mutate(protocolTitle())}
          className="self-start"
        >
          Создать документ
        </Button>
        {create.isError && (
          <p role="alert" className="text-sm text-[var(--danger)]">
            Не удалось создать документ. Попробуйте ещё раз.
          </p>
        )}
      </div>

      <Step n={1} state={first} title="Создайте документ" hint="Бланк и поля, один раз" />
      <Step
        n={2}
        state={second}
        title="Загрузите список"
        hint="Excel или форма с сайта"
        to={last ? `/documents/${last.id}` : '/documents'}
      />
      <Step n={3} state={third} title="Отправьте письма" hint="Каждому — свой документ" to="/mailing" />
    </section>
  );
}

function Step({
  n,
  state,
  title,
  hint,
  to,
}: {
  n: number;
  state: StepState;
  title: string;
  hint: string;
  to?: string;
}) {
  const body: ReactNode = (
    <>
      {/* Номер, а не галочка: порядок шагов важнее отметки «сделано».
          Пройденность показывает цвет — зелёный, синий, контур. */}
      <span
        aria-hidden
        className={cn(
          'grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold tabular-nums',
          state === 'done' && 'bg-[var(--ok)] text-white',
          state === 'current' && 'bg-[var(--accent)] text-white',
          state === 'next' && 'ring-1 ring-[var(--line-strong)] text-[var(--text-muted)]',
        )}
      >
        {n}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs text-[var(--text-muted)]">{hint}</span>
      </span>
    </>
  );

  const box = cn(
    'flex items-center gap-3 rounded-[var(--radius-control)] px-3 py-2.5 transition-colors',
    state === 'current' && 'bg-[var(--accent-soft)]',
    to && 'hover:bg-[var(--surface-sunken)]',
  );

  const label = `Шаг ${n}: ${title}${state === 'done' ? ', пройден' : state === 'current' ? ', сейчас' : ''}`;

  return to ? (
    <Link to={to} aria-label={label} className={box}>
      {body}
    </Link>
  ) : (
    <div aria-label={label} className={box}>
      {body}
    </div>
  );
}
