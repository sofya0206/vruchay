import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  AtSign,
  Building2,
  CalendarDays,
  ChevronRight,
  Flag,
  Hash,
  LoaderCircle,
  MapPin,
  Plus,
  Search,
  ShieldCheck,
  Type,
  UserRound,
  X,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { cn } from '../ui/cn';
import type { FieldInfo } from './fields';
import {
  fieldGroup,
  fieldIcon,
  GROUP_ORDER,
  GROUP_TITLES,
  matchesQuery,
  type FieldGroup,
  type FieldIcon,
} from './field-meta';

/** Формат перетаскивания поля на холст — свой, чтобы не путать с текстом. */
export const FIELD_DRAG_TYPE = 'application/x-vruchay-field';

const ICONS: Record<FieldIcon, LucideIcon> = {
  text: Type,
  person: UserRound,
  email: AtSign,
  date: CalendarDays,
  number: Hash,
  code: ShieldCheck,
  org: Building2,
  event: Flag,
  place: MapPin,
};

/** Что делает клик по полю на этой вкладке. */
export interface FieldAction {
  /** Подпись, которая появляется в строке под указателем: «Вставить». */
  label: string;
  /** Подпись после нажатия, если результат не виден сам: «Скопировано». */
  doneLabel?: string;
  run: (field: FieldInfo) => void | Promise<void>;
}

/**
 * Список полей документа.
 *
 * Строка устроена как в Google Docs и Figma: значок типа, название
 * и справа образец значения — «Место … 1», «Дата выдачи … 04.08.2026».
 * Ключ `%name` в строке не показываем: на листе поле стоит фишкой
 * с тем же названием, и шифр рядом с ним — лишний шум. Действие
 * появляется под указателем на месте образца, в покое строка чистая.
 *
 * Новое поле заводится внизу списка, а не в другом разделе: за ним
 * раньше приходилось уходить в «Получателей» и возвращаться.
 */
export function FieldsList({
  fields,
  samples,
  action,
  onCreate,
  notice,
  draggable = false,
}: {
  fields: FieldInfo[];
  /** Ключ → что встанет на место поля. */
  samples: Record<string, string>;
  action: FieldAction;
  /** Завести поле по названию; вернуть его, чтобы подсветить в списке. */
  onCreate?: (title: string) => Promise<FieldInfo>;
  /** Предупреждение над списком — например, об автосопоставлении. */
  notice?: ReactNode;
  /** Строки можно тащить на блок холста. */
  draggable?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Set<FieldGroup>>(new Set());
  const [done, setDone] = useState<string | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  const visible = useMemo(
    () => fields.filter((f) => matchesQuery(f, samples[f.source], query)),
    [fields, samples, query],
  );
  const groups = GROUP_ORDER.map((group) => ({
    group,
    items: visible.filter((f) => fieldGroup(f) === group),
  })).filter((g) => g.items.length > 0);

  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setDone(null), 1400);
    return () => clearTimeout(t);
  }, [done]);

  useEffect(() => {
    if (!fresh) return;
    scroller.current
      ?.querySelector(`[data-field="${CSS.escape(fresh)}"]`)
      ?.scrollIntoView({ block: 'nearest' });
    const t = setTimeout(() => setFresh(null), 1600);
    return () => clearTimeout(t);
  }, [fresh]);

  async function run(field: FieldInfo) {
    await action.run(field);
    if (action.doneLabel) setDone(field.source);
  }

  async function create(title: string) {
    if (!onCreate) return;
    const field = await onCreate(title);
    setQuery('');
    setFresh(field.source);
  }

  const searching = query.trim() !== '';

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 px-3 pb-2 pt-3">
        <label className="relative block">
          <span className="sr-only">Найти поле</span>
          <Search
            size={15}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && query) {
                e.stopPropagation();
                setQuery('');
              }
              if (e.key === 'Enter' && visible[0]) void run(visible[0]);
            }}
            placeholder="Найти поле"
            className="h-8 w-full rounded-lg bg-[var(--surface)] pl-8 pr-8 text-[13px] text-[var(--text)] outline-none ring-1 ring-[var(--line)] transition-shadow placeholder:text-[var(--text-muted)] focus:ring-2 focus:ring-[var(--focus)] [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button
              type="button"
              aria-label="Очистить поиск"
              onClick={() => setQuery('')}
              className="absolute right-1 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-md text-[var(--text-muted)] hover:bg-[var(--row-hover)] hover:text-[var(--text)]"
            >
              <X size={14} />
            </button>
          )}
        </label>
      </div>

      {notice && <div className="shrink-0 px-3 pb-2">{notice}</div>}

      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
        {groups.map(({ group, items }) => {
          const open = searching || !collapsed.has(group);
          return (
            <section key={group} className="pt-1">
              <button
                type="button"
                aria-expanded={open}
                disabled={searching}
                onClick={() =>
                  setCollapsed((prev) => {
                    const next = new Set(prev);
                    if (next.has(group)) next.delete(group);
                    else next.add(group);
                    return next;
                  })
                }
                className="flex h-7 w-full items-center gap-1 rounded-md px-1.5 text-xs font-medium text-[var(--text-muted)] transition-colors hover:text-[var(--text)] disabled:hover:text-[var(--text-muted)]"
              >
                <ChevronRight
                  size={14}
                  className={cn('shrink-0 transition-transform duration-150', open && 'rotate-90')}
                />
                {GROUP_TITLES[group]}
                <span className="ml-auto tabular-nums">{items.length}</span>
              </button>
              {open && (
                <ul>
                  {items.map((f) => (
                    <Row
                      key={f.source}
                      field={f}
                      sample={samples[f.source]}
                      label={done === f.source && action.doneLabel ? action.doneLabel : action.label}
                      fresh={fresh === f.source}
                      draggable={draggable}
                      onRun={() => void run(f)}
                    />
                  ))}
                </ul>
              )}
            </section>
          );
        })}

        {groups.length === 0 && (
          <div className="px-2 py-6 text-center">
            <p className="text-[13px] text-[var(--text-muted)]">
              {searching ? `Нет полей «${query.trim()}»` : 'Полей пока нет'}
            </p>
            {searching && onCreate && (
              <CreateFromQuery title={query.trim()} onCreate={create} />
            )}
          </div>
        )}
      </div>

      {onCreate && <CreateField onCreate={create} />}
    </div>
  );
}

function Row({
  field,
  sample,
  label,
  fresh,
  draggable,
  onRun,
}: {
  field: FieldInfo;
  sample: string | undefined;
  label: string;
  fresh: boolean;
  draggable: boolean;
  onRun: () => void;
}) {
  const Icon = ICONS[fieldIcon(field)];
  // У проверочного кода образца нет: он появляется в момент выпуска.
  const shown = sample ?? (field.source === 'code' ? 'при выпуске' : '');

  return (
    <li data-field={field.source}>
      <button
        type="button"
        draggable={draggable}
        onDragStart={(e) => {
          e.dataTransfer.setData(FIELD_DRAG_TYPE, JSON.stringify({ source: field.source, fieldId: field.fieldId }));
          e.dataTransfer.effectAllowed = 'copy';
        }}
        onClick={onRun}
        className={cn(
          'group relative flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-left outline-none transition-colors',
          'hover:bg-[var(--row-hover)] focus-visible:bg-[var(--row-hover)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus)]',
          fresh && 'bg-[var(--accent-soft)] hover:bg-[var(--accent-soft)]',
        )}
      >
        <Icon size={15} strokeWidth={1.75} className="shrink-0 text-[var(--text-muted)]" aria-hidden />
        {/* Название берёт свою ширину первым, образец — что осталось:
            при нехватке места сокращается пример, а не имя поля. */}
        <span className="min-w-0 truncate text-[13px] leading-5 text-[var(--text)]">{field.title}</span>
        <span className="min-w-8 flex-1 truncate text-right text-xs leading-5 text-[color-mix(in_srgb,var(--text-muted)_70%,transparent)] transition-opacity group-hover:opacity-0 group-focus-visible:opacity-0">
          {shown}
        </span>
        <span
          aria-hidden
          className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded-md bg-[var(--accent)] px-2 text-xs font-medium leading-5 text-[var(--accent-contrast)] opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
        >
          {label}
        </span>
      </button>
    </li>
  );
}

/** «Создать поле „Команда“» — когда поиск ничего не нашёл. */
function CreateFromQuery({ title, onCreate }: { title: string; onCreate: (title: string) => Promise<void> }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          setError(null);
          try {
            await onCreate(title);
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Не получилось добавить поле');
          } finally {
            setPending(false);
          }
        }}
        className="mx-auto mt-2 flex h-8 max-w-full items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium text-[var(--accent)] hover:bg-[var(--row-hover)] disabled:opacity-60"
      >
        {pending ? <LoaderCircle size={15} className="animate-spin" /> : <Plus size={15} />}
        <span className="truncate">Создать поле «{title}»</span>
      </button>
      {error && <p className="mt-1 text-xs text-[var(--danger)]">{error}</p>}
    </>
  );
}

/**
 * Новое поле — строкой внизу списка.
 *
 * Название пишут по-русски, латинский ключ подбирает сервер: человек
 * думает «здесь будет команда», а не «заведу переменную team».
 */
function CreateField({ onCreate }: { onCreate: (title: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    setEditing(false);
    setTitle('');
    setError(null);
  }

  async function submit() {
    const value = title.trim();
    if (!value || pending) return;
    setPending(true);
    setError(null);
    try {
      await onCreate(value);
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не получилось добавить поле');
    } finally {
      setPending(false);
    }
  }

  if (!editing) {
    return (
      <div className="shrink-0 border-t border-[var(--line)] p-1.5">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-[13px] font-medium text-[var(--accent)] transition-colors hover:bg-[var(--row-hover)]"
        >
          <Plus size={15} className="shrink-0" />
          Новое поле
        </button>
      </div>
    );
  }

  return (
    <form
      className="shrink-0 border-t border-[var(--line)] p-3"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <label htmlFor="new-field-title" className="sr-only">
        Название нового поля
      </label>
      <input
        id="new-field-title"
        autoFocus
        value={title}
        maxLength={120}
        onChange={(e) => {
          setTitle(e.target.value);
          setError(null);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            close();
          }
        }}
        placeholder="Название, например «Команда»"
        className="h-8 w-full rounded-lg bg-[var(--surface)] px-2.5 text-[13px] text-[var(--text)] outline-none ring-1 ring-[var(--line)] transition-shadow placeholder:text-[var(--text-muted)] focus:ring-2 focus:ring-[var(--focus)]"
      />
      <p
        role={error ? 'alert' : undefined}
        className={cn('mt-1.5 text-xs leading-4', error ? 'text-[var(--danger)]' : 'text-[var(--text-muted)]')}
      >
        {error ?? 'Появится колонкой в «Получателях».'}
      </p>
      <div className="mt-2.5 flex justify-end gap-1.5">
        <Button type="button" size="sm" variant="ghost" onClick={close}>
          Отмена
        </Button>
        <Button type="submit" size="sm" variant="primary" disabled={!title.trim() || pending}>
          {pending ? 'Добавляем…' : 'Добавить'}
        </Button>
      </div>
    </form>
  );
}
