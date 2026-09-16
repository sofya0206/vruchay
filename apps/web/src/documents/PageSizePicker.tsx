import { useState } from 'react';
import { PAGE_FORMATS, matchFormat, orientationOf, rotate } from '@gramota/shared';
import { Label } from '../ui/Field';
import { NumberField } from '../ui/NumberField';
import { Select } from '../ui/Select';

export interface PageSizeValue {
  widthMm: number;
  heightMm: number;
}

/**
 * Выбор размера листа: готовый формат плюс ориентация, а миллиметры —
 * только если понадобился нестандартный бланк.
 *
 * Порядок именно такой, потому что человек думает форматом, а не числами:
 * «A4 альбомная» он знает по принтеру, а «297 на 210» ему пришлось бы
 * вспоминать. Поля с миллиметрами показываются лишь после выбора «свой»,
 * чтобы не пугать теми, кому они не нужны.
 *
 * Режим «свой» — отдельное состояние, а не вывод из текущих миллиметров.
 * Выводить его из совпадения с пресетом нельзя: у нового документа размеры
 * всегда равны A4, и выбор «Свой размер» тут же откатывался бы обратно
 * на «A4» — в режим ввода миллиметров было не попасть вовсе.
 */
export function PageSizePicker({
  value,
  onChange,
}: {
  value: PageSizeValue;
  onChange: (next: PageSizeValue) => void;
}) {
  const format = matchFormat(value);
  const orientation = orientationOf(value);
  // Режим включается выбором в списке, но и нестандартные миллиметры,
  // пришедшие снаружи, показываем как «свой»: иначе список соврал бы.
  const [customMode, setCustomMode] = useState(() => !matchFormat(value));
  const custom = customMode || !format;

  const pickFormat = (id: string) => {
    if (id === 'custom') {
      // Размеры не трогаем: человек переключился, чтобы подправить
      // имеющееся, а не начать с нуля.
      setCustomMode(true);
      return;
    }
    const chosen = PAGE_FORMATS.find((f) => f.id === id);
    if (!chosen) return;
    setCustomMode(false);
    onChange(rotate(chosen, orientation));
  };

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="min-w-32">
        <Label>Формат</Label>
        <Select
          value={format && !customMode ? format.id : 'custom'}
          onChange={pickFormat}
          aria-label="Формат"
          options={[
            ...PAGE_FORMATS.map((f) => ({
              value: f.id,
              label: f.label,
              hint: `${f.widthMm}×${f.heightMm} мм`,
            })),
            { value: 'custom', label: 'Свой размер' },
          ]}
        />
      </div>

      <div className="min-w-36">
        <Label>Ориентация</Label>
        <Select
          value={orientation}
          onChange={(next) => onChange(rotate(value, next))}
          aria-label="Ориентация"
          options={[
            { value: 'landscape' as const, label: 'Альбомная' },
            { value: 'portrait' as const, label: 'Книжная' },
          ]}
        />
      </div>

      {custom && (
        <>
          <div className="w-28">
            <Label>Ширина, мм</Label>
            <NumberField
              min={50}
              max={600}
              value={Math.round(value.widthMm)}
              onChange={(raw) => onChange({ ...value, widthMm: clamp(raw, value.widthMm) })}
            />
          </div>
          <div className="w-28">
            <Label>Высота, мм</Label>
            <NumberField
              min={50}
              max={600}
              value={Math.round(value.heightMm)}
              onChange={(raw) => onChange({ ...value, heightMm: clamp(raw, value.heightMm) })}
            />
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Держит значение в границах, которые принимает сервер (50–600 мм).
 * Пустое поле возвращает прежнее значение, а не ноль: иначе лист схлопнулся бы
 * в точку, пока человек стирает цифры, чтобы набрать новые.
 */
function clamp(raw: string, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n === 0) return fallback;
  return Math.min(600, Math.max(50, n));
}
