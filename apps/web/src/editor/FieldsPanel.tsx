import { Sparkles, Table2, Wand2 } from 'lucide-react';
import { Button } from '../ui/Button';
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
 */
export function FieldsPanel({
  fields,
  matches,
  onInsert,
  onAutoMatch,
}: {
  fields: FieldInfo[];
  /** Что автосопоставление готово исправить; пусто — чинить нечего. */
  matches: FieldMatch[];
  onInsert: (field: FieldInfo) => void;
  onAutoMatch: () => void;
}) {
  const columns = fields.filter((f) => f.kind === 'column');
  const system = fields.filter((f) => f.kind === 'system');

  return (
    <div className="space-y-3">
      {matches.length > 0 && (
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

      {columns.length > 0 ? (
        <Group title="Из таблицы" icon={<Table2 size={13} />} items={columns} onInsert={onInsert} />
      ) : (
        <p className="px-1 text-xs text-[var(--text-muted)]">
          Таблица пока пустая: загрузите список, и здесь появятся его колонки.
        </p>
      )}
      <Group title="Подставит сервис" icon={<Sparkles size={13} />} items={system} onInsert={onInsert} />
    </div>
  );
}

function Group({
  title,
  icon,
  items,
  onInsert,
}: {
  title: string;
  icon: React.ReactNode;
  items: FieldInfo[];
  onInsert: (field: FieldInfo) => void;
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
              <span className="shrink-0 text-xs text-[var(--text-muted)]">{f.hint}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
