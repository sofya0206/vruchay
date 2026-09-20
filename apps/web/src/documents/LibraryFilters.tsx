import { Select } from '../ui/Select';

export type LibrarySort = 'updated' | 'created' | 'title';

const SORTS: { id: LibrarySort; title: string }[] = [
  { id: 'updated', title: 'Сначала изменённые' },
  { id: 'created', title: 'Сначала новые' },
  { id: 'title', title: 'По названию' },
];

/**
 * Порядок показа — в нижней строке состояния, рядом с числом материалов.
 *
 * Разделы отсюда уехали в колонку слева и стали папками: лентой кнопок
 * над списком они съедали строку на каждом экране и всё равно читались
 * как фильтр, который кто-то забыл выключить.
 *
 * Порядок остался внизу: его меняют, уже глядя на список, и там он под
 * рукой в любой момент прокрутки, а не только в самом верху страницы.
 */
export function LibrarySortSelect({
  sort,
  onSort,
}: {
  sort: LibrarySort;
  onSort: (value: LibrarySort) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-muted">
      <span className="sr-only sm:not-sr-only">Порядок</span>
      <Select
        value={sort}
        onChange={onSort}
        options={SORTS.map((s) => ({ value: s.id, label: s.title }))}
        aria-label="Порядок в библиотеке"
        compact
        className="w-48"
      />
    </label>
  );
}
