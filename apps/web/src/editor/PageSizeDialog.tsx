import { useState } from 'react';
import { describeSize } from '@gramota/shared';
import { PageSizePicker, type PageSizeValue } from '../documents/PageSizePicker';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';

/**
 * Формат листа у открытого материала — из панели инструментов.
 *
 * Раньше размер задавался только при создании, а потом менялся окольно:
 * загрузкой бланка других пропорций, чтобы сработал вопрос о подгонке.
 * Здесь тот же выбор формата, что и при создании, а что делать с уже
 * расставленными блоками, спросит следующий диалог — этот только про лист.
 */
export function PageSizeDialog({
  current,
  onApply,
  onClose,
}: {
  current: PageSizeValue;
  onApply: (size: PageSizeValue) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<PageSizeValue>(current);
  const changed = draft.widthMm !== current.widthMm || draft.heightMm !== current.heightMm;

  return (
    <Dialog
      title="Формат листа"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button variant="primary" disabled={!changed} onClick={() => onApply(draft)}>
            {changed ? `Сменить лист на ${describeSize(draft)}` : 'Сменить лист'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-muted">Сейчас: {describeSize(current)}</p>
        <PageSizePicker value={draft} onChange={setDraft} />
      </div>
    </Dialog>
  );
}
