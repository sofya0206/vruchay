import { useId, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from './cn';
import { Popover } from './Popover';
import { useDismiss } from './useDismiss';

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
  /** Приглушённый хвост подписи: «A4 · 210×297 мм», «⌘S». */
  hint?: string;
  disabled?: boolean;
  /** Заголовок группы. Группы идут в порядке первого появления. */
  group?: string;
}

/**
 * Выпадающий список.
 *
 * Опции передаются массивом, а не детьми-`<option>`. Разбор детей
 * выглядел бы экономнее, но молча ломается на всём, что не буквальный
 * `<option>`: обёртка-компонент, фрагмент, вызов функции — и вместо
 * ошибки человек видит пустой список. Массив вдобавок даёт настоящую
 * типизацию значения и делает видимыми хитрые случаи, которых у нас
 * восемь: группы условий, опция «нет в таблице» для колонки, которой
 * больше нет, «Смешанное» при выделении нескольких блоков, пустая
 * опция со смыслом «как у блока».
 *
 * Фокус при раскрытии никуда не уходит — остаётся на кнопке, а список
 * управляется через `aria-activedescendant`. Это не уступка редактору
 * текста, а лучшая конструкция для всех: не нужно возвращать фокус при
 * закрытии, не гаснет выделение в правящемся блоке, и на телефоне не
 * выскакивает экранная клавиатура.
 */
export function Select<T extends string = string>({
  value,
  onChange,
  options,
  placeholder,
  disabled,
  className,
  title,
  ...rest
}: {
  value: T | '';
  onChange: (value: T) => void;
  options: readonly SelectOption<T>[];
  /** Подпись кнопки, когда значения нет среди опций. */
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  title?: string;
  'aria-label'?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const search = useRef({ text: '', at: 0 });
  const id = useId();

  useDismiss(open, () => setOpen(false), trigger, panel);

  const selected = options.find((o) => o.value === value);

  // Список с вкраплёнными заголовками групп — в порядке первого появления.
  const rows = useMemo(() => {
    const seen = new Set<string>();
    const out: ({ kind: 'group'; label: string } | { kind: 'option'; option: SelectOption<T>; index: number })[] = [];
    options.forEach((option, index) => {
      if (option.group && !seen.has(option.group)) {
        seen.add(option.group);
        out.push({ kind: 'group', label: option.group });
      }
      out.push({ kind: 'option', option, index });
    });
    return out;
  }, [options]);

  const pick = (option: SelectOption<T>) => {
    if (option.disabled) return;
    onChange(option.value);
    setOpen(false);
  };

  /** Следующая невыключенная опция, с зацикливанием — как в подсказке полей. */
  const move = (from: number, dir: 1 | -1) => {
    if (options.length === 0) return;
    const n = options.length;
    for (let step = 1; step <= n; step++) {
      const next = (((from + dir * step) % n) + n) % n;
      if (!options[next].disabled) return setActive(next);
    }
  };

  const show = (next: boolean) => {
    setOpen(next);
    if (next) {
      const at = options.findIndex((o) => o.value === value);
      setActive(at < 0 ? 0 : at);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;

    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      if (!open) return show(true);
      return move(active, e.key === 'ArrowDown' ? 1 : -1);
    }
    if (!open && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      return show(true);
    }
    if (!open) {
      jump(e);
      return;
    }
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Tab') {
      if (e.key !== 'Tab') e.preventDefault();
      e.stopPropagation();
      if (options[active]) pick(options[active]);
      else setOpen(false);
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      // Гасим: холст редактора тоже слушает Escape и увёл бы из материала.
      e.stopPropagation();
      return setOpen(false);
    }
    if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      return move(e.key === 'Home' ? -1 : options.length, e.key === 'Home' ? 1 : -1);
    }
    jump(e);
  };

  /*
   * Переход по первым буквам — то, чем нативный список брал больше всего.
   * Буквы, набранные подряд, складываются: «Ро» доходит до Roboto, минуя
   * Rubik. Пауза дольше секунды начинает набор заново.
   */
  const jump = (e: React.KeyboardEvent) => {
    if (e.key.length !== 1 || e.metaKey || e.ctrlKey || e.altKey) return;
    const now = Date.now();
    search.current = {
      text: (now - search.current.at > 1000 ? '' : search.current.text) + e.key.toLowerCase(),
      at: now,
    };
    const at = options.findIndex(
      (o) => !o.disabled && o.label.toLowerCase().startsWith(search.current.text),
    );
    if (at < 0) return;
    e.preventDefault();
    if (open) setActive(at);
    else onChange(options[at].value);
  };

  return (
    <>
      <button
        ref={trigger}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${id}-list` : undefined}
        aria-activedescendant={open && options[active] ? `${id}-${active}` : undefined}
        aria-label={rest['aria-label']}
        title={title}
        disabled={disabled}
        onClick={() => show(!open)}
        onKeyDown={onKeyDown}
        className={cn(
          'w-full rounded-lg bg-[var(--surface)] px-3 py-2 text-left text-[var(--text)]',
          'flex items-center justify-between gap-2 ring-1 ring-[var(--line)]',
          'transition-colors outline-none focus:ring-2 focus:ring-[var(--focus)]',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
      >
        <span className="truncate">
          {selected ? (
            <>
              {selected.label}
              {selected.hint && (
                <span className="text-[var(--text-muted)]"> · {selected.hint}</span>
              )}
            </>
          ) : (
            /*
             * Значение, которого нет среди опций, не подменяем первым пунктом:
             * в условии награждения это тихо переписало бы само правило.
             */
            <span className={value === '' ? 'text-[var(--text-muted)]' : undefined}>
              {placeholder ?? value}
            </span>
          )}
        </span>
        <ChevronDown
          size={16}
          aria-hidden
          className={cn(
            'shrink-0 text-[var(--text-muted)] transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>

      {open && (
        <Popover open anchor={trigger} panelRef={panel} role="listbox" width="anchor">
          <div id={`${id}-list`}>
            {rows.map((row) =>
              row.kind === 'group' ? (
                <p
                  key={`g:${row.label}`}
                  className="px-3 pt-2 pb-1 text-xs font-medium text-[var(--text-muted)]"
                >
                  {row.label}
                </p>
              ) : (
                <Item
                  key={row.option.value}
                  id={`${id}-${row.index}`}
                  option={row.option}
                  chosen={row.option.value === value}
                  active={row.index === active}
                  onPick={() => pick(row.option)}
                  onHover={() => setActive(row.index)}
                />
              ),
            )}
            {options.length === 0 && (
              <p className="px-3 py-2 text-sm text-[var(--text-muted)]">Выбирать не из чего</p>
            )}
          </div>
        </Popover>
      )}
    </>
  );
}

function Item<T extends string>({
  id,
  option,
  chosen,
  active,
  onPick,
  onHover,
}: {
  id: string;
  option: SelectOption<T>;
  chosen: boolean;
  active: boolean;
  onPick: () => void;
  onHover: () => void;
}) {
  return (
    <button
      id={id}
      type="button"
      role="option"
      aria-selected={chosen}
      disabled={option.disabled}
      onClick={onPick}
      onPointerMove={onHover}
      // Прокручиваем подсвеченный пункт к себе: длинный список шрифтов
      // иначе открывается в начале, а не на выбранном.
      ref={(node) => {
        if (active) node?.scrollIntoView({ block: 'nearest' });
      }}
      className={cn(
        'flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm',
        'pointer-coarse:py-3 pointer-coarse:text-base',
        'disabled:cursor-not-allowed disabled:opacity-40',
        active && !option.disabled && 'bg-[var(--surface-sunken)]',
        chosen && 'bg-[var(--accent-soft)] text-[var(--accent)]',
      )}
    >
      <span className="truncate">{option.label}</span>
      {option.hint && (
        <span className="shrink-0 text-xs text-[var(--text-muted)]">{option.hint}</span>
      )}
    </button>
  );
}
