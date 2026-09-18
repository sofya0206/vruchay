import { Variable } from 'lucide-react';
import { cn } from '../ui/cn';
import { toggleFieldsPanel, useFieldsPanelOpen } from './fields-sidebar-store';

/**
 * Кнопка панели полей — на панели инструментов вкладки, справа.
 *
 * Раньше «Поля» стояли в шапке рядом с «Выпустить», а под ними на листе —
 * ещё «Заготовка» и «Данные строки»: три кнопки про одно и то же. Теперь
 * кнопка одна, на месте того переключателя, а что показывать на листе —
 * названия полей или данные из таблицы — выбирают в самой панели.
 */
export function FieldsToggle() {
  const open = useFieldsPanelOpen();
  return (
    <button
      type="button"
      aria-pressed={open}
      onClick={toggleFieldsPanel}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium transition-colors',
        open
          ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
          : 'text-[var(--text-muted)] ring-1 ring-[var(--line)] hover:bg-[var(--row-hover)] hover:text-[var(--text)]',
      )}
    >
      <Variable size={16} strokeWidth={1.75} />
      Поля
    </button>
  );
}
