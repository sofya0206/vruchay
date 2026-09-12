import { PAGE_FORMATS, matchFormat, orientationOf, rotate } from '@gramota/shared';
import { Input, Label } from '../ui/Field';
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
  const custom = !format;

  const pickFormat = (id: string) => {
    if (id === 'custom') {
      // Не сбрасываем размеры: человек переключился, чтобы подправить
      // имеющееся, а не начать с нуля.
      onChange({ ...value });
      return;
    }
    const chosen = PAGE_FORMATS.find((f) => f.id === id);
    if (chosen) onChange(rotate(chosen, orientation));
  };

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="min-w-32">
        <Label>Формат</Label>
        <Select
          value={custom ? 'custom' : format.id}
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
            <Input
              type="number"
              min={50}
              max={600}
              value={Math.round(value.widthMm)}
              onChange={(e) => onChange({ ...value, widthMm: clamp(e.target.value, value.widthMm) })}
            />
          </div>
          <div className="w-28">
            <Label>Высота, мм</Label>
            <Input
              type="number"
              min={50}
              max={600}
              value={Math.round(value.heightMm)}
              onChange={(e) => onChange({ ...value, heightMm: clamp(e.target.value, value.heightMm) })}
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
