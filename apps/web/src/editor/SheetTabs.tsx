import { useEffect, useRef, useState } from 'react';
import { List, Plus, Trash2 } from 'lucide-react';
import type { Sheet } from '../api/types';

/**
 * Закладки листов внизу экрана.
 *
 * Материал давно может состоять из нескольких листов: печать раскладывает
 * их по страницам, а предпросмотр показывает все. Но править из редактора
 * можно было только первый — остальные существовали, и добраться до них
 * было нечем. Закладки внизу — то самое место, где их ищут: так устроен
 * любой редактор таблиц и презентаций.
 *
 * Удаление стоит в списке, а не крестиком на закладке: лист — это готовая
 * страница документа, и терять её промахом мыши нельзя.
 */
export function SheetTabs({
  sheets,
  activeId,
  onSelect,
  onAdd,
  onDelete,
  adding = false,
}: {
  sheets: Sheet[];
  activeId: string | undefined;
  onSelect: (sheetId: string) => void;
  onAdd: () => void;
  onDelete: (sheetId: string) => void;
  adding?: boolean;
}) {
  const [listOpen, setListOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!listOpen) return;
    const close = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setListOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setListOpen(false);
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [listOpen]);

  return (
    <div className="flex shrink-0 items-center gap-1 border-t border-[var(--line)] bg-[var(--surface)] px-2 py-1.5">
      <button
        type="button"
        aria-label="Добавить лист"
        disabled={adding}
        onClick={onAdd}
        className="grid h-7 w-7 place-items-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text)] disabled:opacity-40 pointer-coarse:size-11"
      >
        <Plus size={16} />
      </button>

      <div ref={wrap} className="relative">
        <button
          type="button"
          aria-label="Все листы"
          aria-expanded={listOpen}
          aria-haspopup="menu"
          onClick={() => setListOpen((v) => !v)}
          className="grid h-7 w-7 place-items-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text)] pointer-coarse:size-11"
        >
          <List size={16} />
        </button>

        {listOpen && (
          <div
            role="menu"
            className="absolute bottom-full left-0 z-30 mb-1 min-w-[220px] rounded-xl bg-[var(--surface)] py-1.5 shadow-lg ring-1 ring-[var(--line)]"
          >
            {sheets.map((sheet, i) => (
              <div key={sheet.id} className="flex items-center">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setListOpen(false);
                    onSelect(sheet.id);
                  }}
                  className={`flex-1 px-3.5 py-2 text-left text-sm transition-colors hover:bg-[var(--surface-sunken)] pointer-coarse:py-3 pointer-coarse:text-base ${
                    sheet.id === activeId ? 'font-medium text-[var(--accent)]' : ''
                  }`}
                >
                  Лист {i + 1}
                </button>
                {/* Единственный лист удалить нельзя: документ без листа
                    печатать нечем. */}
                {sheets.length > 1 && (
                  <button
                    type="button"
                    aria-label={`Удалить лист ${i + 1}`}
                    onClick={() => {
                      setListOpen(false);
                      onDelete(sheet.id);
                    }}
                    className="mr-1.5 grid h-7 w-7 place-items-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-[var(--danger-soft)] hover:text-[var(--danger)] pointer-coarse:size-11"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <span aria-hidden className="mx-1 h-5 w-px bg-[var(--line)]" />

      <div className="flex min-w-0 items-center gap-1 overflow-x-auto">
        {sheets.map((sheet, i) => (
          <button
            key={sheet.id}
            type="button"
            aria-current={sheet.id === activeId ? 'page' : undefined}
            onClick={() => onSelect(sheet.id)}
            className={`shrink-0 rounded-lg px-3 py-1 text-sm transition-colors pointer-coarse:py-2.5 ${
              sheet.id === activeId
                ? 'bg-[var(--accent-soft)] font-medium text-[var(--accent)]'
                : 'text-[var(--text-muted)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text)]'
            }`}
          >
            Лист {i + 1}
          </button>
        ))}
      </div>
    </div>
  );
}
