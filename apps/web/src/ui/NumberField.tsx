import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from './cn';
import { addStep, clamp, parseDecimal } from './number';

/**
 * Числовое поле со своими стрелками.
 *
 * Поле текстовое, а не `type="number"`, и это не обход, а упрощение:
 * прятать нечего — ни системного счётчика, ни его отступов, — принимается
 * запятая с русской раскладки, и незаконченный набор («-», «1.») не
 * превращается в пустую строку посреди слова.
 *
 * Стрелки в покое не видны: в панели свойств таких полей дюжина, и
 * дюжина пар серых уголков рябит сильнее, чем помогает. Появляются при
 * наведении и при фокусе; на сенсорном экране, где наведения нет, —
 * всегда.
 *
 * Наверх отдаём сырую строку, как отдавал нативный `input`. Ограничители
 * у вызывающих разные по смыслу — один откатывает ноль, чтобы лист не
 * схлопнулся, пока стирают цифры, другой режет до целого, третий даёт
 * своё значение на каждое поле, — и сводить их в один нельзя.
 */
export function NumberField({
  value,
  onChange,
  min,
  max,
  step = 1,
  placeholder,
  disabled,
  className,
  ...rest
}: {
  value: number | string;
  onChange: (raw: string) => void;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
}) {
  const [text, setText] = useState(String(value));

  // Значение могло смениться снаружи: другой выделенный блок, отмена действия
  // или собственный ограничитель вызывающего, подрезавший набранное.
  useEffect(() => setText(String(value)), [value]);

  const nudge = (dir: 1 | -1) => {
    const current = parseDecimal(text) ?? parseDecimal(String(value)) ?? 0;
    onChange(String(clamp(addStep(current, dir * step), min, max)));
  };

  return (
    <div className={cn('group relative', className)}>
      <input
        type="text"
        inputMode="decimal"
        value={text}
        disabled={disabled}
        placeholder={placeholder}
        aria-label={rest['aria-label']}
        onChange={(e) => {
          setText(e.target.value);
          // Наверх уходит только законченное: иначе «-» превратился бы в ноль.
          if (parseDecimal(e.target.value) !== null) onChange(e.target.value);
        }}
        // Ушли из поля с недописанным — возвращаем действующее значение.
        onBlur={() => setText(String(value))}
        onKeyDown={(e) => {
          if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
          e.preventDefault();
          nudge(e.key === 'ArrowUp' ? 1 : -1);
        }}
        className={
          'tabular w-full rounded-lg bg-[var(--surface)] py-2 pr-7 pl-3 text-[var(--text)] ' +
          'ring-1 ring-[var(--line)] transition-colors outline-none ' +
          'placeholder:text-[var(--text-muted)] focus:ring-2 focus:ring-[var(--focus)] ' +
          'disabled:opacity-40'
        }
      />
      <span
        aria-hidden
        className={
          'absolute inset-y-1 right-1 flex flex-col justify-center opacity-0 transition-opacity ' +
          'group-hover:opacity-100 group-focus-within:opacity-100 pointer-coarse:opacity-100'
        }
      >
        <Arrow dir={1} onClick={() => nudge(1)} disabled={disabled} />
        <Arrow dir={-1} onClick={() => nudge(-1)} disabled={disabled} />
      </span>
    </div>
  );
}

/*
 * Стрелки убраны из обхода табуляцией: с клавиатуры значение меняют
 * стрелками на самом поле, а второй способ только удлинял бы путь
 * через панель свойств на две дюжины остановок.
 */
function Arrow({
  dir,
  onClick,
  disabled,
}: {
  dir: 1 | -1;
  onClick: () => void;
  disabled?: boolean;
}) {
  const Icon = dir === 1 ? ChevronUp : ChevronDown;
  return (
    <button
      type="button"
      tabIndex={-1}
      disabled={disabled}
      onClick={onClick}
      className="grid h-3.5 w-5 place-items-center rounded text-[var(--text-muted)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text)]"
    >
      <Icon size={12} strokeWidth={2.5} />
    </button>
  );
}
