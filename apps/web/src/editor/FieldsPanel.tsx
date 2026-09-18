import { useState } from 'react';
import { Plus, Sparkles, Table2, Wand2 } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Field';
import type { FieldInfo, FieldMatch } from './fields';

/** Формат перетаскивания поля на холст — свой, чтобы не путать с текстом. */
export const FIELD_DRAG_TYPE = 'application/x-vruchay-field';

/**
 * Панель полей: что можно подставить в документ.
 *
 * Клик вставляет поле туда, где каретка, — а если блок не правится,
 * заводит новый блок с этим полем. Перетаскивание кладёт поле в блок
 * на холсте. Автосопоставление — первым, а не последним: если макет
 * ждёт колонок, которых в таблице нет под таким именем, это чинится
 * одной кнопкой, а не поиском по блокам.
 *
 * Новое поле заводится прямо здесь. Раньше за ним надо было уйти
 * на «Получателей», добавить колонку и вернуться на лист — три перехода
 * ради одного слова на грамоте.
 */
export function FieldsPanel({
  fields,
  matches = [],
  onInsert,
  onAutoMatch,
  onCreate,
  hint,
  showKeys = false,
}: {
  fields: FieldInfo[];
  /** Что автосопоставление готово исправить; пусто — чинить нечего. */
  matches?: FieldMatch[];
  onInsert: (field: FieldInfo) => void;
  onAutoMatch?: () => void;
  /** Завести колонку по названию. Нет — поле добавить отсюда нельзя. */
  onCreate?: (title: string) => Promise<unknown>;
  /** Что сделает клик по полю — одной строкой над списком. */
  hint?: string;
  /**
   * Показывать `%ключ` вместо «из таблицы».
   *
   * В письме поле пишется ключом, и человеку нужно видеть, что именно
   * окажется в тексте. На листе ключ спрятан за фишкой — там он лишний.
   */
  showKeys?: boolean;
}) {
  const columns = fields.filter((f) => f.kind === 'column');
  const system = fields.filter((f) => f.kind === 'system');

  return (
    <div className="space-y-3">
      {onCreate && <CreateField onCreate={onCreate} />}

      {matches.length > 0 && onAutoMatch && (
        <div className="rounded-lg bg-[var(--accent-soft)] p-2.5 text-sm">
          <p>
            В макете {matches.length === 1 ? 'есть поле' : 'есть поля'}, которых нет в таблице:{' '}
            {matches.map((m) => `«${m.from}» → «${m.to.name}»`).join(', ')}.
          </p>
          <Button size="sm" variant="primary" icon={<Wand2 size={14} />} onClick={onAutoMatch} className="mt-2">
            Сопоставить автоматически
          </Button>
        </div>
      )}

      {hint && <p className="px-1 text-xs text-[var(--text-muted)]">{hint}</p>}

      {columns.length > 0 ? (
        <Group title="Из таблицы" icon={<Table2 size={13} />} items={columns} onInsert={onInsert} showKeys={showKeys} />
      ) : (
        <p className="px-1 text-xs text-[var(--text-muted)]">
          Таблица пока пустая: загрузите список или заведите поле выше.
        </p>
      )}
      {system.length > 0 && (
        <Group title="Подставит сервис" icon={<Sparkles size={13} />} items={system} onInsert={onInsert} showKeys={showKeys} />
      )}
    </div>
  );
}

/**
 * Новое поле — названием по-русски.
 *
 * Имя переменной латиницей подбирает сервер: человек пишет «Команда»,
 * а не придумывает `team`, и не упирается в ошибку про латинские буквы.
 */
function CreateField({ onCreate }: { onCreate: (title: string) => Promise<unknown> }) {
  const [title, setTitle] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const value = title.trim();
    if (!value || pending) return;
    setPending(true);
    setError(null);
    try {
      await onCreate(value);
      setTitle('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не получилось добавить поле');
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      className="rounded-lg bg-[var(--surface-sunken)] p-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <label htmlFor="new-field" className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">
        Новое поле
      </label>
      <div className="flex gap-1.5">
        <Input
          id="new-field"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setError(null);
          }}
          placeholder="Команда"
          maxLength={120}
          className="min-w-0 flex-1"
        />
        <Button type="submit" size="sm" icon={<Plus size={14} />} disabled={!title.trim() || pending}>
          {pending ? 'Добавляем' : 'Добавить'}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="mt-1.5 text-xs text-[var(--danger)]">
          {error}
        </p>
      ) : (
        <p className="mt-1.5 text-xs text-[var(--text-muted)]">Появится колонкой в таблице получателей.</p>
      )}
    </form>
  );
}

function Group({
  title,
  icon,
  items,
  onInsert,
  showKeys,
}: {
  title: string;
  icon: React.ReactNode;
  items: FieldInfo[];
  onInsert: (field: FieldInfo) => void;
  showKeys: boolean;
}) {
  return (
    <div>
      <p className="mb-1 flex items-center gap-1.5 px-1 text-xs font-medium text-[var(--text-muted)]">
        {icon}
        {title}
      </p>
      <ul className="space-y-0.5">
        {items.map((f) => (
          <li key={f.source}>
            <button
              type="button"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(FIELD_DRAG_TYPE, JSON.stringify({ source: f.source, fieldId: f.fieldId }));
                e.dataTransfer.effectAllowed = 'copy';
              }}
              onClick={() => onInsert(f)}
              className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-[var(--surface-sunken)]"
            >
              <span className="truncate">{f.title}</span>
              <span className={`shrink-0 text-xs text-[var(--text-muted)] ${showKeys ? 'font-mono' : ''}`}>
                {showKeys ? `%${f.source}` : f.hint}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
