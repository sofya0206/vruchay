import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  AtSign,
  Building2,
  CalendarDays,
  ChevronDown,
  FileText,
  Flag,
  Hash,
  LoaderCircle,
  MapPin,
  Medal,
  Plus,
  Search,
  ShieldCheck,
  Type,
  UserRound,
  UsersRound,
  X,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { cn } from '../ui/cn';
import type { FieldInfo } from './fields';
import {
  fieldEntries,
  GROUP_ORDER,
  GROUP_TITLES,
  filterEntries,
  type FieldEntry,
  type FieldGroup,
  type FieldIcon,
} from './field-meta';
import { errorText } from '../api/client';

/** Формат перетаскивания поля на холст — свой, чтобы не путать с текстом. */
export const FIELD_DRAG_TYPE = 'application/x-vruchay-field';

const ICONS: Record<FieldIcon, LucideIcon> = {
  text: Type,
  person: UserRound,
  email: AtSign,
  date: CalendarDays,
  number: Hash,
  medal: Medal,
  code: ShieldCheck,
  org: Building2,
  event: Flag,
  place: MapPin,
};

/*
 * Цвет секции. Секции одного вида на белом сливались: свернул — и уже
 * не понять, где кончаются получатели и начинается документ. Цвет
 * держит границу и после сворачивания: синий — люди из таблицы,
 * фиолетовый — мероприятие, серо-синий — то, что сервис считает сам.
 * Статусных зелёного, жёлтого и красного здесь нет намеренно: они
 * в кабинете значат «готово», «внимание» и «сломано».
 */
const GROUP_STYLE: Record<FieldGroup, { color: string; icon: LucideIcon }> = {
  recipient: { color: '#127ee3', icon: UsersRound },
  event: { color: '#7a5af8', icon: Flag },
  document: { color: '#5b6b86', icon: FileText },
};

/** Что делает клик по полю на этой вкладке. */
export interface FieldAction {
  /** Подпись, которая появляется в строке под указателем: «Вставить». */
  label: string;
  /** Подпись после нажатия, если результат не виден сам: «Скопировано». */
  doneLabel?: string;
  run: (field: FieldInfo) => void | Promise<void>;
}

function plural(n: number, forms: [string, string, string]): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return forms[0];
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return forms[1];
  return forms[2];
}

/**
 * Список полей документа.
 *
 * Три секции карточками своего цвета; внутри одна строка на значение,
 * нажатие вставляет его. Вид записи — дата словами, ФИО в дательном —
 * в панели не перечисляется: его выбирают на листе, в настройках самой
 * фишки (правая кнопка по полю), там, где видно, как он ляжет в текст.
 *
 * Ключ `%name` в строке не показываем: на листе поле стоит фишкой
 * с тем же названием, и шифр рядом с ним — лишний шум.
 */
export function FieldsList({
  fields,
  samples,
  action,
  onCreate,
  notice,
  header,
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
  /** Строка над поиском — например, что показывать на листе. */
  header?: ReactNode;
  /** Строки можно тащить на блок холста. */
  draggable?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Set<FieldGroup>>(new Set());
  const [done, setDone] = useState<string | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  const entries = useMemo(() => fieldEntries(fields), [fields]);
  const visible = useMemo(() => filterEntries(entries, samples, query), [entries, samples, query]);
  const searching = query.trim() !== '';
  const sections = GROUP_ORDER.map((group) => ({
    group,
    items: visible.filter((e) => e.group === group),
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
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.delete('recipient');
      return next;
    });
    setFresh(field.source);
  }

  const toggle = <T,>(set: (fn: (prev: Set<T>) => Set<T>) => void, key: T) =>
    set((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const labelFor = (field: FieldInfo) =>
    done === field.source && action.doneLabel ? action.doneLabel : action.label;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {header}
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
              if (e.key === 'Enter' && visible[0]) void run(visible[0].variants[0].field);
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

      <div ref={scroller} className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 pb-3">
        {sections.map(({ group, items }) => {
          const open = searching || !collapsed.has(group);
          const style = GROUP_STYLE[group];
          const GroupIcon = style.icon;
          return (
            <section
              key={group}
              style={{ '--group': style.color } as CSSProperties}
              className="overflow-hidden rounded-xl bg-[var(--surface)] ring-1 ring-[color-mix(in_srgb,var(--group)_22%,transparent)]"
            >
              <button
                type="button"
                aria-expanded={open}
                disabled={searching}
                onClick={() => toggle(setCollapsed, group)}
                className="field-row flex h-10 w-full items-center gap-2.5 bg-[color-mix(in_srgb,var(--group)_8%,var(--surface))] px-3 text-left transition-colors hover:bg-[color-mix(in_srgb,var(--group)_12%,var(--surface))]"
              >
                <span className="grid size-6 shrink-0 place-items-center rounded-md bg-[var(--group)] text-white">
                  <GroupIcon size={14} strokeWidth={2} />
                </span>
                <span className="shrink-0 text-[13px] font-semibold text-[var(--text)]">{GROUP_TITLES[group]}</span>
                {/* Свёрнутая секция показывает, что в ней: иначе закрытые
                    карточки одинаковы, и искать приходится открывая все. */}
                <span className="min-w-0 flex-1 truncate text-xs text-[var(--text-muted)]">
                  {open ? '' : items.map((e) => e.title).join(', ')}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-[color-mix(in_srgb,var(--group)_80%,var(--text))]">
                  {items.length} {plural(items.length, ['поле', 'поля', 'полей'])}
                </span>
                <ChevronDown
                  size={16}
                  className={cn(
                    'shrink-0 text-[var(--text-muted)] transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none',
                    !open && '-rotate-90',
                  )}
                />
              </button>
              <Collapse open={open}>
                <ul className="border-t border-[color-mix(in_srgb,var(--group)_16%,transparent)] p-1">
                  {items.map((entry) => (
                    <EntryRow
                      key={entry.id}
                      entry={entry}
                      samples={samples}
                      fresh={fresh === entry.id}
                      draggable={draggable}
                      labelFor={labelFor}
                      onRun={(field) => void run(field)}
                    />
                  ))}
                </ul>
              </Collapse>
            </section>
          );
        })}

        {sections.length === 0 && (
          <div className="px-2 py-6 text-center">
            <p className="text-[13px] text-[var(--text-muted)]">
              {searching ? `Нет полей «${query.trim()}»` : 'Полей пока нет'}
            </p>
            {searching && onCreate && <CreateFromQuery title={query.trim()} onCreate={create} />}
          </div>
        )}
      </div>

      {onCreate && <CreateField onCreate={create} />}
    </div>
  );
}

/**
 * Плавное раскрытие без замера высоты: строка сетки тянется от 0fr до 1fr.
 * Скрытое содержимое `inert` — Tab не проваливается в свёрнутую секцию.
 */
function Collapse({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <div
      className={cn(
        'grid transition-[grid-template-rows] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none',
        open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
      )}
    >
      <div className="min-h-0 overflow-hidden" inert={!open}>
        {children}
      </div>
    </div>
  );
}

// Рамку фокуса рисует общее правило кабинета; `field-row` только утапливает
// её внутрь строки (index.css) — снаружи её обрезал бы край карточки.
const rowClass =
  'field-row group relative flex w-full items-center gap-2.5 rounded-lg px-2 text-left transition-colors ' +
  'hover:bg-[color-mix(in_srgb,var(--group)_7%,transparent)] focus-visible:bg-[color-mix(in_srgb,var(--group)_7%,transparent)]';

/** Синяя «Вставить» на месте образца — только под указателем. */
function ActionPill({ label }: { label: string }) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded-md bg-[var(--accent)] px-2 text-xs font-medium leading-5 text-[var(--accent-contrast)] opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
    >
      {label}
    </span>
  );
}

const sampleClass =
  'min-w-8 flex-1 truncate text-right text-xs leading-5 text-[color-mix(in_srgb,var(--text-muted)_70%,transparent)]';

function dragProps(draggable: boolean, field: FieldInfo) {
  return {
    draggable,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.setData(FIELD_DRAG_TYPE, JSON.stringify({ source: field.source, fieldId: field.fieldId }));
      e.dataTransfer.effectAllowed = 'copy';
    },
  };
}

function sampleOf(field: FieldInfo, samples: Record<string, string>): string {
  // У проверочного кода образца нет: он появляется в момент выпуска.
  return samples[field.source] ?? (field.source === 'code' ? 'при выпуске' : '');
}

function EntryRow({
  entry,
  samples,
  fresh,
  draggable,
  labelFor,
  onRun,
}: {
  entry: FieldEntry;
  samples: Record<string, string>;
  fresh: boolean;
  draggable: boolean;
  labelFor: (field: FieldInfo) => string;
  onRun: (field: FieldInfo) => void;
}) {
  const Icon = ICONS[entry.icon];
  // Вставляется основной вид; падеж или «словами» выбирают потом на листе.
  const main = entry.variants[0].field;

  return (
    <li data-field={entry.id}>
      <button
        type="button"
        {...dragProps(draggable, main)}
        onClick={() => onRun(main)}
        className={cn(rowClass, 'h-9', fresh && 'bg-[var(--accent-soft)] hover:bg-[var(--accent-soft)]')}
      >
        <Icon size={16} strokeWidth={1.75} className="shrink-0 text-[var(--group)]" aria-hidden />
        <span className="min-w-0 truncate text-[13px] leading-5 text-[var(--text)]">{entry.title}</span>
        <span className={cn(sampleClass, 'transition-opacity duration-150 group-hover:opacity-0 group-focus-visible:opacity-0')}>
          {sampleOf(main, samples)}
        </span>
        <ActionPill label={labelFor(main)} />
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
            setError(errorText(err));
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
      setError(errorText(err));
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
