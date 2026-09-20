import { useState } from 'react';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { Field, Input } from '../ui/Field';

/**
 * Переименовать материал из библиотеки.
 *
 * Раньше в списке имя спрашивал `window.prompt`. В открытом материале окна
 * нет: там название правится на месте, в шапке (`editor/DocumentTitle`).
 */
export function RenameDialog({
  initial,
  pending,
  error,
  onSubmit,
  onClose,
}: {
  initial: string;
  pending?: boolean;
  error?: string;
  onSubmit: (title: string) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(initial);
  const ready = title.trim().length > 0 && title.trim() !== initial;

  return (
    <Dialog
      title="Переименовать документ"
      size="sm"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button variant="primary" disabled={!ready} loading={pending} onClick={() => onSubmit(title.trim())}>
            Сохранить
          </Button>
        </>
      }
    >
      <Field label="Название" error={error}>
        <Input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && ready) onSubmit(title.trim());
          }}
        />
      </Field>
    </Dialog>
  );
}
