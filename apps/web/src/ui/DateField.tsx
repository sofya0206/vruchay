import { useEffect, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from './cn';
import { Popover } from './Popover';
import { useDismiss } from './useDismiss';
import { MONTHS, WEEKDAYS, fromIso, humanIso, monthGrid, shiftMonth, todayIso } from './calendar';

/**
 * Поле даты со своим календарём.
 *
 * Значение ходит строкой «ГГГГ-ММ-ДД» — тем же видом, что отдавало
 * нативное поле, поэтому вызывающий код и сервер не замечают подмены.
 *
 * Системный календарь выглядел чужим в каждом браузере по-своему, а в
 * Chromium ещё и рисовал серый значок, который ничем не красится. Свой
 * вдобавок подписывает дату по-русски: «12 сентября 2026» вместо
 * «12.09.2026», где месяц и день легко перепутать местами.
 */
export function DateField({
  value,
  onChange,
  onCommit,
  min,
  max,
  placeholder = 'Выберите дату',
  clearable = true,
  disabled,
  className,
  ...rest
}: {
  value: string;
  onChange: (iso: string) => void;
  /**
   * Момент «человек закончил». Нужен там, где сохранение висело на уходе
   * из поля: с поповером уход наступает в миг открытия календаря.
   */
  onCommit?: () => void;
  min?: string;
  max?: string;
  placeholder?: string;
  clearable?: boolean;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  const close = () => {
    setOpen(false);
    onCommit?.();
  };

  useDismiss(open, close, trigger, panel);

  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={rest['aria-label']}
        disabled={disabled}
        onClick={() => (open ? close() : setOpen(true))}
        className={cn(
          'w-full rounded-control bg-surface px-3 py-2 text-left text-ink',
          'flex items-center justify-between gap-2 ring-1 ring-line',
          'transition-colors outline-none focus:ring-2 focus:ring-focus',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
      >
        <span className={cn('truncate', !value && 'text-muted')}>
          {humanIso(value) ?? placeholder}
        </span>
        <CalendarDays size={16} aria-hidden className="shrink-0 text-muted" />
      </button>

      {open && (
        <Popover open anchor={trigger} panelRef={panel} role="dialog" width={268}>
          <Month
            value={value}
            min={min}
            max={max}
            clearable={clearable}
            onPick={(iso) => {
              onChange(iso);
              close();
            }}
          />
        </Popover>
      )}
    </>
  );
}

function Month({
  value,
  min,
  max,
  clearable,
  onPick,
}: {
  value: string;
  min?: string;
  max?: string;
  clearable: boolean;
  onPick: (iso: string) => void;
}) {
  const today = todayIso();
  const start = fromIso(value) ?? fromIso(today)!;
  const [at, setAt] = useState({ year: start.year, month: start.month });

  // Значение сменилось снаружи — показываем месяц новой даты.
  useEffect(() => {
    const parsed = fromIso(value);
    if (parsed) setAt({ year: parsed.year, month: parsed.month });
  }, [value]);

  const blocked = (iso: string) => (min && iso < min) || (max && iso > max);

  return (
    <div className="w-full p-2">
      <div className="flex items-center justify-between gap-1 px-1 pb-1.5">
        <Step label="Прошлый месяц" onClick={() => setAt(shiftMonth(at.year, at.month, -1))}>
          <ChevronLeft size={16} />
        </Step>
        <span className="text-sm font-medium">
          {MONTHS[at.month]} {at.year}
        </span>
        <Step label="Следующий месяц" onClick={() => setAt(shiftMonth(at.year, at.month, 1))}>
          <ChevronRight size={16} />
        </Step>
      </div>

      <div className="grid grid-cols-7 gap-0.5 text-center">
        {WEEKDAYS.map((name) => (
          <span key={name} className="py-1 text-xs text-muted">
            {name}
          </span>
        ))}
        {monthGrid(at.year, at.month)
          .flat()
          .map((day) => {
            const chosen = day.iso === value;
            return (
              <button
                key={day.iso}
                type="button"
                disabled={!!blocked(day.iso)}
                aria-current={day.iso === today ? 'date' : undefined}
                onClick={() => onPick(day.iso)}
                className={cn(
                  'tabular grid h-8 place-items-center rounded-md text-sm transition-colors',
                  'disabled:cursor-not-allowed disabled:opacity-30',
                  day.outside && 'text-muted',
                  !chosen && 'hover:bg-sunken',
                  // Сегодня обводим, выбранное заливаем: два разных признака
                  // не должны читаться одинаково.
                  day.iso === today && !chosen && 'ring-1 ring-line-strong',
                  chosen && 'bg-accent text-on-accent',
                )}
              >
                {day.day}
              </button>
            );
          })}
      </div>

      <div className="mt-1.5 flex gap-1 border-t border-line pt-1.5">
        <Action onClick={() => onPick(today)} disabled={!!blocked(today)}>
          Сегодня
        </Action>
        {clearable && (
          <Action onClick={() => onPick('')} muted>
            Очистить
          </Action>
        )}
      </div>
    </div>
  );
}

function Step({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="grid size-7 place-items-center rounded-md text-muted transition-colors hover:bg-sunken hover:text-ink pointer-coarse:size-11"
    >
      {children}
    </button>
  );
}

function Action({
  onClick,
  disabled,
  muted,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  muted?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex-1 rounded-md py-1.5 text-sm transition-colors hover:bg-sunken',
        'disabled:cursor-not-allowed disabled:opacity-40',
        muted ? 'text-muted' : 'text-accent',
      )}
    >
      {children}
    </button>
  );
}
