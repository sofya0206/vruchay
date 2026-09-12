import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import type { AwardCondition, AwardOp, AwardStatus } from '@gramota/shared';
import { AWARD_STATUSES, AWARD_STATUS_TITLES } from '@gramota/shared';
import { Checkbox } from '../ui/Checkbox';
import { Input, Select } from '../ui/Field';
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
 * Ширину задаём обёрткой, а не классом на самом поле: у Input и Select
 * из ui/Field в базовых классах есть w-full, и он выигрывает у переданного
 * w-40 независимо от порядка в атрибуте. Поле растягивалось на всю строку,
 * и условие переставало читаться одной фразой.
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
          onChange={(e) => onChange({ ...condition, field: e.target.value })}
        >
          {!columns.includes(condition.field) && (
            <option value={condition.field}>{condition.field} — нет в таблице</option>
          )}
          {columns.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
      </Sized>

      <Sized width="w-48">
        <Select
          aria-label="Условие"
          value={condition.op}
          onChange={(e) => setOp(e.target.value as AwardOp)}
        >
          <optgroup label="Место">
            {PLACE_OPS.map((op) => (
              <option key={op} value={op}>
                {OP_TITLES[op]}
              </option>
            ))}
          </optgroup>
          <optgroup label="Статус">
            {STATUS_OPS.map((op) => (
              <option key={op} value={op}>
                {OP_TITLES[op]}
              </option>
            ))}
          </optgroup>
          <optgroup label="Значение">
            {GENERAL_OPS.map((op) => (
              <option key={op} value={op}>
                {OP_TITLES[op]}
              </option>
            ))}
          </optgroup>
        </Select>
      </Sized>

      <ConditionValue condition={condition} onChange={onChange} />

      {isPlace && (
        <label
          className="flex items-center gap-1.5 text-sm text-[var(--text-muted)]"
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

      <button
        onClick={onRemove}
        aria-label="Убрать условие"
        className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text)]"
      >
        <X size={15} />
      </button>
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
          <Input
            type="number"
            min={1}
            max={300}
            aria-label="Место"
            value={condition.value}
            onChange={(e) => onChange({ ...condition, value: clampPlace(e.target.value) })}
          />
        </Sized>
      );

    case 'placeBetween':
      return (
        <div className="flex items-center gap-2">
          <span className="text-sm text-[var(--text-muted)]">с</span>
          <Sized width="w-20">
            <Input
              type="number"
              min={1}
              max={300}
              aria-label="Место от"
              value={condition.value.from}
              onChange={(e) =>
                onChange({
                  ...condition,
                  value: { ...condition.value, from: clampPlace(e.target.value) },
                })
              }
            />
          </Sized>
          <span className="text-sm text-[var(--text-muted)]">по</span>
          <Sized width="w-20">
            <Input
              type="number"
              min={1}
              max={300}
              aria-label="Место до"
              value={condition.value.to}
              onChange={(e) =>
                onChange({
                  ...condition,
                  value: { ...condition.value, to: clampPlace(e.target.value) },
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
                className={`cursor-pointer rounded-full px-2.5 py-1 text-xs ring-1 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--focus)] ${
                  checked
                    ? 'bg-[var(--award-soft)] text-[var(--award)] ring-transparent'
                    : 'text-[var(--text-muted)] ring-[var(--line-strong)]'
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
