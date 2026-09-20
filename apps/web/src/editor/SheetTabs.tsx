import { List, Plus, Trash2 } from 'lucide-react';
import type { Sheet } from '../api/types';
import { IconButton } from '../ui/IconButton';
import { Menu, MenuItem } from '../ui/Menu';
import { cn } from '../ui/cn';

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
  return (
    <div className="flex shrink-0 items-center gap-1 border-t border-line bg-surface px-2 py-1.5">
      <IconButton size="sm" label="Добавить лист" disabled={adding} onClick={onAdd}>
        <Plus size={16} />
      </IconButton>

      <Menu
        align="left"
        side="top"
        title="Листы"
        trigger={({ open, toggle }) => (
          <IconButton size="sm" label="Все листы" active={open} aria-expanded={open} aria-haspopup="menu" onClick={toggle}>
            <List size={16} />
          </IconButton>
        )}
      >
        {sheets.map((sheet, i) => (
          <div key={sheet.id} className="flex items-center gap-1">
            <MenuItem
              onClick={() => onSelect(sheet.id)}
              className={cn('flex-1', sheet.id === activeId && 'font-medium text-accent')}
            >
              Лист {i + 1}
            </MenuItem>
            {/* Единственный лист удалить нельзя: документ без листа
                печатать нечем. Кнопка — пункт меню, чтобы список
                закрывался после неё так же, как после выбора листа. */}
            {sheets.length > 1 && (
              <IconButton
                size="sm"
                role="menuitem"
                label={`Удалить лист ${i + 1}`}
                className="hover:bg-danger-soft hover:text-danger"
                onClick={() => onDelete(sheet.id)}
              >
                <Trash2 size={16} />
              </IconButton>
            )}
          </div>
        ))}
      </Menu>

      <span aria-hidden className="mx-1 h-5 w-px bg-line" />

      <div role="tablist" aria-label="Листы" className="no-scrollbar flex min-w-0 items-center gap-0.5 overflow-x-auto rounded-control bg-sunken p-0.5">
        {sheets.map((sheet, i) => {
          const active = sheet.id === activeId;
          return (
            <button
              key={sheet.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onSelect(sheet.id)}
              className={cn(
                'pressable h-7 shrink-0 rounded-[6px] px-3 text-sm whitespace-nowrap pointer-coarse:h-10',
                active ? 'bg-surface font-medium text-ink shadow-sm' : 'text-muted hover:text-ink',
              )}
            >
              Лист {i + 1}
            </button>
          );
        })}
      </div>
    </div>
  );
}
