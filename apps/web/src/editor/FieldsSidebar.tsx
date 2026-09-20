import { useEffect } from 'react';
import { X } from 'lucide-react';
import { onboarding } from '../onboarding/store';
import { useRecipientMutations } from '../api/recipients';
import { IconButton } from '../ui/IconButton';
import { FieldsList, type FieldAction } from './FieldsList';
import { fieldFromColumn, type FieldInfo } from './fields';
import { setFieldsPanelOpen } from './fields-sidebar-store';
import { useDocumentFields, useFieldSamples } from './useDocumentFields';

/**
 * Куда вставляет клик по полю на этой вкладке.
 *
 * Вкладка сама знает, где у неё курсор, — рамке материала это
 * неизвестно, поэтому вставку она берёт у вкладки готовой.
 */
export interface FieldTarget {
  insert: (field: FieldInfo) => void;
  /**
   * Только колонки таблицы. Письмо подставляет данные строки, а «Дату
   * выпуска» и номер знает только лист, — предлагать их там значит
   * обещать подстановку, которой не будет.
   */
  columnsOnly?: boolean;
}

const COPY: FieldAction = {
  label: 'Копировать',
  doneLabel: 'Скопировано',
  run: async (field) => {
    try {
      await navigator.clipboard.writeText(`%${field.source}`);
    } catch {
      // Буфер закрыт настройками браузера — копировать нечем.
    }
  },
};

/**
 * Панель полей справа — на вкладках, где нет своей боковой колонки.
 *
 * Встаёт рядом с содержимым, а не поверх: поверх она закрывала правые
 * колонки таблицы, и чтобы их увидеть, панель приходилось закрывать.
 * Где вставлять некуда, клик копирует `%ключ` для письма или листа.
 */
export function FieldsSidebar({ documentId, target }: { documentId: string; target?: FieldTarget }) {
  const { fields } = useDocumentFields(documentId);
  const samples = useFieldSamples(documentId);
  const m = useRecipientMutations(documentId);
  // Панель данных открыта и здесь — точка в редакторе не нужна.
  useEffect(() => onboarding.markSeen('fields'), []);

  const shown = target?.columnsOnly ? fields.filter((f) => f.kind === 'column') : fields;
  const action: FieldAction = target ? { label: 'Вставить', run: target.insert } : COPY;

  return (
    <aside
      aria-label="Данные"
      className="flex w-80 shrink-0 flex-col border-l border-line bg-surface"
    >
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-line pl-4 pr-1">
        <h2 className="text-sm font-medium">Данные</h2>
        <IconButton size="sm" label="Закрыть панель" onClick={() => setFieldsPanelOpen(false)}>
          <X size={16} />
        </IconButton>
      </div>
      <FieldsList
        fields={shown}
        samples={samples}
        action={action}
        onCreate={async (title) => {
          const field = fieldFromColumn(await m.addColumn.mutateAsync({ title }));
          // Там, где есть курсор, новое поле сразу встаёт в текст:
          // ради этого его обычно и заводят.
          target?.insert(field);
          return field;
        }}
      />
    </aside>
  );
}
