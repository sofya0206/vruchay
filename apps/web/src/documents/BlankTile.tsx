import { useState } from 'react';
import { ImageUp } from 'lucide-react';
import { OptionCard } from '../ui/OptionCard';

/**
 * Плитка «Свой бланк» — как и другие варианты начать лист, но ещё
 * принимает файл, брошенный прямо на неё: так бланк ставят фоном,
 * а не картинкой поверх листа. Пунктирная рамка (`dropzone`) сплошнеет
 * и заливается акцентом на время наведения файла — тем же приёмом,
 * что и у выбранного варианта.
 *
 * Общая для двух мест: холста (editor/EditorPage.tsx, выбор пути для
 * ещё не начатого листа) и окна создания документа
 * (documents/CreateDocumentPanel.tsx) — вопрос про бланк один и тот же,
 * компонент тоже один.
 */
export function BlankTile({
  onPick,
  onFile,
  disabled,
  selected,
}: {
  onPick: () => void;
  onFile: (file: File) => void;
  disabled?: boolean;
  /** Отмечена и без наведения файла — когда бланк уже выбран снаружи. */
  selected?: boolean;
}) {
  const [over, setOver] = useState(false);
  return (
    <OptionCard
      icon={ImageUp}
      title="Свой бланк"
      description="PNG · JPG"
      dropzone
      disabled={disabled}
      tabIndex={0}
      selected={over || selected}
      onSelect={onPick}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        const file = e.dataTransfer.files[0];
        if (!file) return;
        e.preventDefault();
        setOver(false);
        onFile(file);
      }}
    />
  );
}
