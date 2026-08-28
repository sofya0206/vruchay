import { DOCUMENT_CATEGORIES, type DocumentCategory } from '@gramota/shared';
import { Select } from '../ui/Field';

export type LibrarySort = 'updated' | 'created' | 'title';

const SORTS: { id: LibrarySort; title: string }[] = [
  { id: 'updated', title: 'Сначала изменённые' },
  { id: 'created', title: 'Сначала новые' },
  { id: 'title', title: 'По названию' },
];

/**
 * Разделы и порядок библиотеки.
 *
 * Разделы — кнопками, а не выпадающим списком: их пять, они видны все сразу,
 * и человек выбирает свой раздел одним движением. Порядок — списком: его
 * меняют редко, и место под пять кнопок он не заслуживает.
 */
export function LibraryFilters({
  category,
  onCategory,
  sort,
  onSort,
  counts,
}: {
  category: DocumentCategory | null;
  onCategory: (value: DocumentCategory | null) => void;
  sort: LibrarySort;
  onSort: (value: LibrarySort) => void;
  /** Сколько материалов в каждом разделе — чтобы не вести в пустой. */
  counts?: Record<string, number>;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-center gap-3">
      <div className="flex flex-wrap gap-1.5">
        <Chip active={category === null} label="Все разделы" onClick={() => onCategory(null)}>
          Все
        </Chip>
        {DOCUMENT_CATEGORIES.map((c) => (
          <Chip
            key={c.id}
            active={category === c.id}
            label={c.title}
            hint={c.hint}
            onClick={() => onCategory(category === c.id ? null : c.id)}
          >
            {c.title}
            {counts?.[c.id] ? (
              <span className="tabular text-[var(--text-muted)]">{counts[c.id]}</span>
            ) : null}
          </Chip>
        ))}
      </div>

      <label className="ml-auto flex items-center gap-2 text-sm text-[var(--text-muted)]">
        <span className="sr-only sm:not-sr-only">Порядок</span>
        <Select
          value={sort}
          onChange={(e) => onSort(e.target.value as LibrarySort)}
          aria-label="Порядок в библиотеке"
          className="w-48"
        >
          {SORTS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </Select>
      </label>
    </div>
  );
}

function Chip({
  active,
  label,
  hint,
  onClick,
  children,
}: {
  active: boolean;
  /** Видимое название раздела. */
  label: string;
  hint?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={hint}
      /* Имя кнопки — название раздела, а не подсказка: без этого чтение
         с экрана объявляет «Грамоты и дипломы за места» там, где глазами
         человек видит «Спортивные соревнования». */
      aria-label={label}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition-colors ${
        active
          ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
          : 'bg-[var(--surface-sunken)] text-[var(--text-muted)] hover:text-[var(--text)]'
      }`}
    >
      {children}
    </button>
  );
}
