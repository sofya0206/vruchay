import { Check } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from './cn';

/*
 * Флажок и переключатель.
 *
 * Внутри — настоящий `<input>`, спрятанный `sr-only`, а видимую коробку
 * рисуем рядом. Кнопка с `role="checkbox"` выглядела бы так же, но
 * стоила бы дорого: пропало бы значение в `FormData` (публичная форма
 * «Обсудить условия» читает согласие именно оттуда), браузерная проверка
 * `required`, ходьба стрелками по группе радио с одним `name` и связь
 * с обёрткой `<label>` — а в неё завёрнуты восемнадцать из двадцати
 * шести наших мест. Приём в проекте уже был, в чипах условий награждения.
 *
 * Галочку рисуем по пропу, а не правилом `peer-checked`: компонент
 * управляемый, состояние и так известно, а `~` в CSS до вложенного
 * значка всё равно не достаёт.
 */

const box =
  'grid size-[18px] shrink-0 place-items-center rounded-[5px] ring-1 transition-colors ' +
  'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 ' +
  'peer-focus-visible:outline-[var(--focus)] peer-disabled:opacity-40';

const on = 'bg-[var(--accent)] ring-[var(--accent)]';
const off = 'bg-[var(--surface)] ring-[var(--line-strong)]';

interface Shared {
  disabled?: boolean;
  /** Подпись. Без неё компонент годится внутрь чужого `<label>` и в ячейку таблицы. */
  label?: ReactNode;
  hint?: ReactNode;
  name?: string;
  className?: string;
  'aria-label'?: string;
}

export function Checkbox({
  checked,
  onChange,
  disabled,
  label,
  hint,
  name,
  required,
  className,
  ...rest
}: Shared & {
  checked: boolean;
  onChange: (checked: boolean) => void;
  required?: boolean;
}) {
  const control = (
    <span className="relative inline-flex items-center">
      <input
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        disabled={disabled}
        name={name}
        required={required}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={rest['aria-label']}
      />
      <span aria-hidden className={cn(box, checked ? on : off)}>
        {checked && <Check size={12} strokeWidth={3} className="text-[var(--accent-contrast)]" />}
      </span>
    </span>
  );

  return label === undefined ? (
    <Bare control={control} disabled={disabled} className={className} />
  ) : (
    <Framed control={control} label={label} hint={hint} disabled={disabled} className={className} />
  );
}

export function Radio({
  checked,
  onChange,
  disabled,
  label,
  hint,
  name,
  className,
  ...rest
}: Shared & {
  checked: boolean;
  onChange: () => void;
  /** Обязателен: по нему браузер собирает группу и водит по ней стрелками. */
  name: string;
}) {
  const control = (
    <span className="relative inline-flex items-center">
      <input
        type="radio"
        className="peer sr-only"
        checked={checked}
        disabled={disabled}
        name={name}
        onChange={onChange}
        aria-label={rest['aria-label']}
      />
      <span aria-hidden className={cn(box, 'rounded-full', checked ? on : off)}>
        {checked && <span className="size-1.5 rounded-full bg-[var(--accent-contrast)]" />}
      </span>
    </span>
  );

  return label === undefined ? (
    <Bare control={control} disabled={disabled} className={className} />
  ) : (
    <Framed control={control} label={label} hint={hint} disabled={disabled} className={className} />
  );
}

/**
 * Коробка без подписи — в ячейке таблицы.
 *
 * Всё равно `<label>`, а не `<span>`: настоящий `<input>` спрятан, и
 * нажатие приходится на нарисованную коробку. Без `<label>` оно никуда
 * не уходило — в реестре и таблице получателей строки не отмечались.
 */
function Bare({
  control,
  disabled,
  className,
}: {
  control: ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <label
      className={cn(
        'inline-flex',
        disabled ? 'cursor-not-allowed' : 'cursor-pointer',
        className,
      )}
    >
      {control}
    </label>
  );
}

/**
 * Оправа с подписью.
 *
 * Подпись — часть цели нажатия, а не текст рядом: попасть по коробке
 * в 18 точек с телефона трудно, а промах по настройке доступа стоит
 * дорого. Коробку сдвигаем на пол-строки вниз, чтобы она встала по
 * первой строке текста, а не по середине абзаца.
 */
function Framed({
  control,
  label,
  hint,
  disabled,
  className,
}: {
  control: ReactNode;
  label: ReactNode;
  hint?: ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <label
      className={cn(
        'flex items-start gap-2.5 text-sm',
        disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
        className,
      )}
    >
      <span className="mt-0.5">{control}</span>
      <span>
        {label}
        {hint && <span className="mt-0.5 block text-[var(--text-muted)]">{hint}</span>}
      </span>
    </label>
  );
}
