import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useRecipientMutations } from '../api/recipients';
import { IconButton } from '../ui/IconButton';
import { FieldsPanel } from './FieldsPanel';
import { fieldFromColumn, type FieldInfo } from './fields';
import { useDocumentFields } from './useDocumentFields';

/**
 * Куда вставляет клик по полю на этой вкладке.
 *
 * Вкладка сама знает, где у неё каретка, — рамке материала это
 * неизвестно, поэтому вставку она берёт у вкладки готовой.
 */
export interface FieldTarget {
  /** Что сделает клик — строкой над списком. */
  hint: string;
  insert: (field: FieldInfo) => void;
  /**
   * Только колонки таблицы. Письмо подставляет данные строки, а «Дату
   * выпуска» и номер знает только лист, — предлагать их там значит
   * обещать подстановку, которой не будет.
   */
  columnsOnly?: boolean;
}

/**
 * Поля материала — выдвижной колонкой справа, на любой вкладке.
 *
 * На листе те же поля живут в его боковой колонке рядом со свойствами
 * и слоями; здесь колонки нет, и панель выезжает поверх содержимого.
 * Где вставлять некуда, клик копирует `%ключ`: его вписывают в текст
 * на листе или в письмо.
 */
export function FieldsDrawer({
  documentId,
  target,
  onClose,
}: {
  documentId: string;
  target?: FieldTarget;
  onClose: () => void;
}) {
  const { fields } = useDocumentFields(documentId);
  const m = useRecipientMutations(documentId);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(null), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  async function copy(field: FieldInfo) {
    const token = `%${field.source}`;
    try {
      await navigator.clipboard.writeText(token);
      setCopied(token);
    } catch {
      // Буфер закрыт настройками браузера — ключ хотя бы виден в строке.
      setCopied(null);
    }
  }

  const insert = target ? target.insert : (field: FieldInfo) => void copy(field);
  const shown = target?.columnsOnly ? fields.filter((f) => f.kind === 'column') : fields;

  return (
    <aside
      aria-label="Поля"
      className="absolute right-0 top-full z-30 flex h-[calc(100dvh-var(--app-header)-100%)] w-80 flex-col border-l border-[var(--line)] bg-[var(--surface)] shadow-lg"
    >
      <div className="flex items-center justify-between border-b border-[var(--line)] py-1 pl-4 pr-1">
        <h2 className="text-sm font-medium">Поля</h2>
        <IconButton size="sm" label="Закрыть панель" onClick={onClose}>
          <X size={15} />
        </IconButton>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <FieldsPanel
          fields={shown}
          onInsert={insert}
          showKeys
          hint={
            copied
              ? `Скопировано: ${copied}`
              : (target?.hint ?? 'Клик копирует поле — вставьте его в текст на листе или в письмо.')
          }
          onCreate={async (title) => {
            const column = await m.addColumn.mutateAsync({ title });
            // На вкладке с кареткой новое поле сразу встаёт в текст:
            // ради этого его обычно и заводят.
            target?.insert(fieldFromColumn(column));
          }}
        />
      </div>
    </aside>
  );
}
