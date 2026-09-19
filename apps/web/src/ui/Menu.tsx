import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation } from 'react-router-dom';
import { BottomSheet } from './BottomSheet';
import { cn } from './cn';
import { useMediaQuery } from './useMediaQuery';

/** Поле между списком и краем окна, зазор до кнопки и ширина `min-w-56`. */
const EDGE = 8;
const GAP = 4;
const MIN_WIDTH = 224;

/**
 * Выпадающее меню — одно на кабинет.
 *
 * Кнопка-триггер и список под ней. Закрывается по Esc, по клику вне,
 * при смене адреса и после выбора пункта. Пункты — `MenuItem` (кнопка
 * или ссылка) и `MenuDivider`; заголовок-подпись — `MenuLabel`.
 *
 * Список рисуется порталом в body и стоит по координатам кнопки, а не
 * внутри неё. Колонка разделов прокручивается по вертикали, а `overflow-y`
 * по правилам CSS срезает и по горизонтали: в свёрнутой рейке шириной
 * 64 точки от меню «Помощь» в 224 оставались значки и первые буквы
 * подписей. Тот же приём — в `Popover` и `Tooltip`.
 *
 * На сенсорном экране список выезжает нижним листом: кнопка «…» стоит
 * у верхнего края, и выпадашка под ней открывалась там, куда большой
 * палец не достаёт. Признак — грубый указатель, а не ширина окна:
 * планшету с пальцем лист нужен так же, как телефону.
 */
export function Menu({
  trigger,
  children,
  align = 'right',
  side = 'bottom',
  className = '',
  title = 'Действия',
}: {
  /** Рисует кнопку: получает открыт ли список и обработчик нажатия. */
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  children: ReactNode;
  align?: 'left' | 'right';
  /** Куда раскрывать: вниз от кнопки или вверх — для кнопок у нижнего края. */
  side?: 'bottom' | 'top';
  className?: string;
  /** Заголовок нижнего листа на сенсорном экране. */
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState<{
    left: number;
    top?: number;
    bottom?: number;
    room: number;
  } | null>(null);
  const { pathname } = useLocation();
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const touch = useMediaQuery('(pointer: coarse)');

  useEffect(() => setOpen(false), [pathname]);

  // Эффект идёт по второму кругу, как только список впервые отрисован
  // (`placed`): первый круг ставит его по ширине `min-w-56`, второй уже
  // меряет настоящую и выравнивает по правому краю — до кадра, без мигания.
  const placed = box !== null;

  useLayoutEffect(() => {
    if (!open || touch) {
      setBox(null);
      return;
    }

    const place = () => {
      const anchor = root.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const w = panel.current?.offsetWidth ?? MIN_WIDTH;
      const h = panel.current?.offsetHeight ?? 0;

      // Куда хотели, туда и открываем, а переворачиваем, только если там
      // не помещается и на другой стороне места больше.
      const room = {
        top: rect.top - EDGE - GAP,
        bottom: window.innerHeight - rect.bottom - EDGE - GAP,
      };
      const other = side === 'top' ? 'bottom' : 'top';
      const dir = room[side] < h && room[other] > room[side] ? other : side;

      const left = align === 'right' ? rect.right - w : rect.left;
      setBox({
        left: Math.max(EDGE, Math.min(left, window.innerWidth - w - EDGE)),
        room: room[dir],
        // Вверх — через `bottom`: высота списка на этот момент может быть
        // ещё неизвестна, а `bottom` её знать и не требует.
        ...(dir === 'top'
          ? { bottom: window.innerHeight - rect.top + GAP }
          : { top: rect.bottom + GAP }),
      });
    };

    place();
    // Захват — чтобы ловить прокрутку вложенных колонок, а не только окна.
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open, touch, side, align, placed]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      // Список лежит в body, а не в `root`, — нажатие в нём тоже «внутри».
      const target = e.target as Node;
      if (!root.current?.contains(target) && !panel.current?.contains(target)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const closeOnPick = (e: React.MouseEvent) => {
    // Любой выбранный пункт закрывает меню; разделители и подписи — нет.
    if ((e.target as HTMLElement).closest('[role="menuitem"]')) setOpen(false);
  };

  if (touch) {
    return (
      <div ref={root} className={cn('relative', className)}>
        {trigger({ open, toggle: () => setOpen((v) => !v) })}
        <BottomSheet open={open} onClose={() => setOpen(false)} title={title}>
          <div role="menu" onClick={closeOnPick}>
            {children}
          </div>
        </BottomSheet>
      </div>
    );
  }

  return (
    <div ref={root} className={cn('relative', className)}>
      {trigger({ open, toggle: () => setOpen((v) => !v) })}
      {open &&
        box &&
        createPortal(
          <div
            ref={panel}
            role="menu"
            onClick={closeOnPick}
            className="card fixed z-50 min-w-56 overflow-y-auto bg-[var(--surface-raised)] p-1.5 shadow-lg"
            // Предел высоты — по месту, которое осталось: длинное меню
            // прокручивается, а не уезжает за край окна.
            style={{ left: box.left, top: box.top, bottom: box.bottom, maxHeight: Math.max(160, box.room) }}
          >
            {children}
          </div>,
          document.body,
        )}
    </div>
  );
}

const itemClass =
  'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[15px] text-[var(--text)] transition-colors hover:bg-[var(--surface-sunken)] disabled:opacity-50 disabled:hover:bg-transparent ' +
  // Под палец: 48 точек в высоту, как у пунктов системных листов.
  'pointer-coarse:min-h-12 pointer-coarse:px-3 pointer-coarse:text-base';

export function MenuItem({
  icon,
  to,
  danger,
  children,
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: ReactNode;
  /** Ссылка вместо кнопки. */
  to?: string;
  danger?: boolean;
}) {
  const cls = cn(itemClass, danger && 'text-[var(--danger)] hover:bg-[var(--danger-soft)]', className);
  if (to) {
    return (
      <Link role="menuitem" to={to} className={cls}>
        {icon}
        {children}
      </Link>
    );
  }
  return (
    <button type="button" role="menuitem" className={cls} {...rest}>
      {icon}
      {children}
    </button>
  );
}

export function MenuDivider() {
  return <div className="my-1.5 h-px bg-[var(--line)]" />;
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <div className="truncate px-2.5 pt-1 pb-2 text-sm text-[var(--text-muted)]">{children}</div>;
}
