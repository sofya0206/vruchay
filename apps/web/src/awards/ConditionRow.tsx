import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import type { AwardCondition, AwardOp, AwardStatus } from '@gramota/shared';
import { AWARD_STATUSES, AWARD_STATUS_TITLES } from '@gramota/shared';
import { Checkbox } from '../ui/Checkbox';
import { IconButton } from '../ui/IconButton';
import { Input } from '../ui/Field';
import { NumberField } from '../ui/NumberField';
import { Select } from '../ui/Select';
import { blankCondition, GENERAL_OPS, OP_TITLES, PLACE_OPS, STATUS_OPS } from './condition-labels';

interface Props {
  condition: AwardCondition;
  columns: string[];
  /** Выбрана ли колонка группы: без неё считать место внутри группы не по чему. */
  hasGroupColumn: boolean;
  onChange: (next: AwardCondition) => void;
  onRemove: () => void;
}

/**
 * Ширину задаём обёрткой, а не классом на самом поле.
 *
 * Раньше причина была в Tailwind: базовый w-full поля выигрывал у любого
 * переданного w-40, и условие растягивалось на всю строку. Эту часть давно
 * закрыл twMerge в ui/cn. Обёртка осталась ради shrink-0: строка условия
 * переносится по словам, и без него поля сжимались бы до нечитаемых.
 */
function Sized({ width, children }: { width: string; children: ReactNode }) {
  return <div className={`${width} shrink-0`}>{children}</div>;
}

/**
 * Одна строка условия: «[колонка] [операция] [значение]».
 *
 * Операции по месту и по статусу лежат в отдельных группах списка,
 * чтобы не выбирать «место равно» для колонки с фамилией. Жёстко
 * ограничивать выбор не стали: какая колонка чем окажется в чужом
 * протоколе, заранее не известно, и запрет обошёлся бы дороже подсказки.
 */
export function ConditionRow({ condition, columns, hasGroupColumn, onChange, onRemove }: Props) {
  const setOp = (op: AwardOp) => onChange(blankCondition(condition.field, op));
  const isPlace = condition.op === 'placeEquals' || condition.op === 'placeBetween';

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Sized width="w-40">
        <Select
          aria-label="Колонка"
          value={condition.field}
          onChange={(field) => onChange({ ...condition, field })}
          options={[
            /* Колонки в файле могло не стать, а условие на неё осталось.
               Показываем её отдельной строкой: молчаливый сброс на первую
               переписал бы само правило, и человек бы этого не увидел. */
            ...(columns.includes(condition.field)
              ? []
              : [{ value: condition.field, label: `${condition.field} — нет в таблице` }]),
            ...columns.map((c) => ({ value: c, label: c })),
          ]}
        />
      </Sized>

      <Sized width="w-48">
        <Select
          aria-label="Условие"
          value={condition.op}
          onChange={setOp}
          options={[
            ...PLACE_OPS.map((op) => ({ value: op, label: OP_TITLES[op], group: 'Место' })),
            ...STATUS_OPS.map((op) => ({ value: op, label: OP_TITLES[op], group: 'Статус' })),
            ...GENERAL_OPS.map((op) => ({ value: op, label: OP_TITLES[op], group: 'Значение' })),
          ]}
        />
      </Sized>

      <ConditionValue condition={condition} onChange={onChange} />

      {isPlace && (
        <label
          className="flex items-center gap-1.5 text-sm text-muted"
          title={
            hasGroupColumn
              ? 'Пересчитать место среди строк той же группы. Нужно, когда нумерация в файле сквозная на весь протокол'
              : 'Сначала выберите колонку группы вверху'
          }
        >
          <Checkbox
            checked={condition.withinGroup}
            disabled={!hasGroupColumn}
            onChange={(withinGroup) => onChange({ ...condition, withinGroup })}
          />
          внутри группы
        </label>
      )}

      <IconButton size="sm" label="Убрать условие" onClick={onRemove}>
        <X size={16} />
      </IconButton>
    </div>
  );
}

function ConditionValue({
  condition,
  onChange,
}: {
  condition: AwardCondition;
  onChange: (next: AwardCondition) => void;
}) {
  switch (condition.op) {
    case 'filled':
    case 'empty':
      return null;

    case 'placeEquals':
      return (
        <Sized width="w-24">
          <NumberField
            min={1}
            max={300}
            aria-label="Место"
            value={condition.value}
            onChange={(raw) => onChange({ ...condition, value: clampPlace(raw) })}
          />
        </Sized>
      );

    case 'placeBetween':
      return (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted">с</span>
          <Sized width="w-20">
            <NumberField
              min={1}
              max={300}
              aria-label="Место от"
              value={condition.value.from}
              onChange={(raw) =>
                onChange({
                  ...condition,
                  value: { ...condition.value, from: clampPlace(raw) },
                })
              }
            />
          </Sized>
          <span className="text-sm text-muted">по</span>
          <Sized width="w-20">
            <NumberField
              min={1}
              max={300}
              aria-label="Место до"
              value={condition.value.to}
              onChange={(raw) =>
                onChange({
                  ...condition,
                  value: { ...condition.value, to: clampPlace(raw) },
                })
              }
            />
          </Sized>
        </div>
      );

    case 'statusIn':
      return (
        <div className="flex flex-wrap gap-1.5">
          {AWARD_STATUSES.filter((s) => s !== 'ok').map((status) => {
            const checked = condition.value.includes(status);
            return (
              <label
                key={status}
                /* Кольцо фокуса здесь своё: сам вход спрятан, и общее
                   правило :focus-visible нарисовало бы его вокруг ничего. */
                className={`cursor-pointer rounded-full px-2.5 py-1 text-xs ring-1 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus ${
                  checked
                    ? 'bg-info-soft text-info ring-transparent'
                    : 'text-muted ring-line-strong'
                }`}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={checked}
                  onChange={() =>
                    onChange({
                      ...condition,
                      value: toggle(condition.value as AwardStatus[], status),
                    })
                  }
                />
                {AWARD_STATUS_TITLES[status]}
              </label>
            );
          })}
        </div>
      );

    case 'oneOf':
      return (
        <Sized width="w-64">
          <Input
            aria-label="Значения через запятую"
            value={condition.value.join(', ')}
            placeholder="юноши, девушки"
            // Пустой список схема не примет, поэтому пока человек стирает
            // текст, держим одно пустое значение — правило просто не совпадёт.
            onChange={(e) => onChange({ ...condition, value: splitValues(e.target.value) })}
          />
        </Sized>
      );

    default:
      return (
        <Sized width="w-56">
          <Input
            aria-label="Значение"
            value={condition.value}
            onChange={(e) => onChange({ ...condition, value: e.target.value })}
          />
        </Sized>
      );
  }
}

function clampPlace(raw: string): number {
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n)) return 1;
  return Math.min(300, Math.max(1, n));
}

function splitValues(raw: string): string[] {
  const parts = raw
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  return parts.length ? parts : [''];
}

function toggle(values: AwardStatus[], status: AwardStatus): AwardStatus[] {
  const next = values.includes(status) ? values.filter((v) => v !== status) : [...values, status];
  // Совсем пустой список статусов схема не примет — оставляем последний.
  return next.length ? next : values;
}
