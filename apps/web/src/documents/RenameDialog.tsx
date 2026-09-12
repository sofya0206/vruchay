import { useState } from 'react';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { Input, Label } from '../ui/Field';

/**
 * Переименовать материал — одно окно на библиотеку и редактор.
 *
 * Раньше в списке имя спрашивал `window.prompt`, а в редакторе — своё окно:
 * два разных вида одного действия в соседних экранах.
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
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button
            variant="primary"
            disabled={!ready || pending}
            onClick={() => onSubmit(title.trim())}
          >
            {pending ? 'Сохраняем…' : 'Сохранить'}
          </Button>
        </>
      }
    >
      <Label>Название</Label>
      <Input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && ready) onSubmit(title.trim());
        }}
      />
      {error && (
        <p role="alert" className="mt-2 text-sm text-[var(--danger)]">
          {error}
        </p>
      )}
    </Dialog>
  );
}
