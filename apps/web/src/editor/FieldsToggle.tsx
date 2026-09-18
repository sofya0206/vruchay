import { Variable } from 'lucide-react';
import { cn } from '../ui/cn';
import { toggleFieldsPanel, useFieldsPanelOpen } from './fields-sidebar-store';

/**
 * Кнопка панели данных — на «Получателях» и в «Письме», где у страницы
 * нет своей правой панели. На листе та же панель — вкладка «Данные»
 * рядом со свойствами и слоями, и отдельной кнопки там нет.
 *
 * «Данные», а не «Поля»: поля есть и у листа (отступы печати), а здесь —
 * то, что подставится из таблицы получателей.
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
      Данные
    </button>
  );
}
