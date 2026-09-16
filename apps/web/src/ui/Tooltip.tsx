import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { FocusEvent, PointerEvent, ReactNode, RefObject } from 'react';

/**
 * Подсказка под указателем — вместо системной.
 *
 * Браузерная подсказка (атрибут `title`) не поддаётся ни оформлению, ни
 * задержке, появляется спустя секунду с лишним в углу курсора и живёт
 * по своим правилам в каждом браузере. Своя плашка нужна не ради красоты:
 * в панели инструментов подпись под значком — единственное, что объясняет
 * кнопку, и её появление не должно быть лотереей.
 *
 * Позицию считаем сами, а не через `Popover`: тот на сенсорном экране
 * разворачивается в нижний лист, что для подсказки бессмысленно, и умеет
 * куда больше нужного — высоту по месту, сохранение выделения, закрытие
 * по нажатию мимо.
 */

/** Задержка перед показом: короче — плашки выскакивают при проходе мимо. */
const SHOW_DELAY = 400;
const HIDE_DELAY = 100;

/**
 * Пока одна подсказка только что была на экране, следующая открывается
 * без задержки. Иначе проход по ряду кнопок панели превращается в череду
 * пауз: человек уже понял правило и ждёт подпись сразу.
 */
const WARM_MS = 300;
let warmUntil = 0;

/** Поле между плашкой и краем окна и отступ от триггера. */
const EDGE = 8;
const GAP = 6;

type Placement = 'top' | 'bottom' | 'right';

interface Options {
  /**
   * Показывать, только если текст в триггере не поместился. Для строк
   * с многоточием: у короткого имени подсказка — шум, у обрезанного она
   * единственный способ прочитать целиком.
   */
  onlyWhenTruncated?: boolean;
  /**
   * Подсказка несёт то, чего нет в доступном имени, — тогда её читает
   * и скринридер. По умолчанию считаем, что она повторяет `aria-label`
   * или видимую подпись, и второй раз её озвучивать не надо.
   */
  describes?: boolean;
  placement?: Placement;
  /**
   * Где искать переполнение, если текст лежит не в самом триггере,
   * а во вложенном элементе.
   */
  measure?: RefObject<HTMLElement | null>;
}

export function useTooltip(label: string | undefined, options: Options = {}) {
  const { onlyWhenTruncated = false, describes = false, placement = 'top', measure } = options;
  const trigger = useRef<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const id = useId();

  const stop = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const hide = useCallback(
    (immediately = false) => {
      stop();
      if (!immediately) {
        timer.current = setTimeout(() => setOpen(false), HIDE_DELAY);
      } else {
        setOpen(false);
      }
      warmUntil = Date.now() + WARM_MS;
    },
    [stop],
  );

  /** Стоит ли вообще показывать: есть текст, не сенсор, текст обрезан. */
  const worth = useCallback(() => {
    if (!label) return false;
    // Спрашиваем в момент показа, а не при монтировании: публичные страницы
    // предварительно отрисовываются в статику, и ответ той машины, что
    // собирала, попал бы в разметку.
    if (window.matchMedia('(pointer: coarse)').matches) return false;
    if (!onlyWhenTruncated) return true;
    const el = measure?.current ?? trigger.current;
    if (!el) return false;
    return el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1;
  }, [label, onlyWhenTruncated, measure]);

  const show = useCallback(
    (delay: number) => {
      stop();
      if (!worth()) return;
      if (delay === 0) {
        setOpen(true);
        return;
      }
      timer.current = setTimeout(() => setOpen(true), delay);
    },
    [stop, worth],
  );

  useEffect(() => stop, [stop]);

  // Плашка стоит по координатам и вместе со страницей не едет, поэтому
  // на прокрутку и смену размера окна её проще убрать, чем пересчитывать.
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    document.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  /*
   * Триггер запоминаем из события, а не через `ref`.
   *
   * Обработчики вешаются на чужие компоненты — `Link`, `NavLink`, `Button`,
   * — и не все они пробрасывают `ref` наружу. Ссылка его не пробросила,
   * плашка осталась без точки отсчёта и рисовалась в углу с нулевой
   * прозрачностью. `currentTarget` есть всегда и указывает ровно на тот
   * элемент, на котором висит обработчик.
   */
  const triggerProps = {
    onPointerEnter: (e: PointerEvent<HTMLElement>) => {
      trigger.current = e.currentTarget;
      show(Date.now() < warmUntil ? 0 : SHOW_DELAY);
    },
    onPointerLeave: () => hide(),
    // Нажали — подсказка больше не нужна: человек уже выбрал.
    onPointerDown: () => hide(true),
    // С клавиатуры ждать нечего: фокус — это уже намерение.
    onFocus: (e: FocusEvent<HTMLElement>) => {
      if (e.target !== e.currentTarget) return;
      trigger.current = e.currentTarget;
      show(0);
    },
    onBlur: () => hide(true),
    ...(describes && open ? { 'aria-describedby': id } : {}),
  };

  return {
    triggerProps,
    tooltip:
      open && label ? (
        <Bubble
          id={id}
          label={label}
          anchor={trigger}
          placement={placement}
          describes={describes}
        />
      ) : null,
  };
}

function Bubble({
  id,
  label,
  anchor,
  placement,
  describes,
}: {
  id: string;
  label: string;
  anchor: RefObject<HTMLElement | null>;
  placement: Placement;
  describes: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // Меряем после первой отрисовки: до неё ширина плашки неизвестна,
  // а от неё зависит и переворот, и прижим к краю.
  useEffect(() => {
    const a = anchor.current;
    const b = box.current;
    if (!a || !b) return;
    const t = a.getBoundingClientRect();
    const w = b.offsetWidth;
    const h = b.offsetHeight;

    let top = placement === 'bottom' ? t.bottom + GAP : t.top - h - GAP;
    let left = placement === 'right' ? t.right + GAP : t.left + t.width / 2 - w / 2;

    if (placement === 'right') {
      top = t.top + t.height / 2 - h / 2;
      // Справа не поместилось — уходим влево от триггера.
      if (left + w > window.innerWidth - EDGE) left = t.left - w - GAP;
    } else if (top < EDGE) {
      // Сверху не поместилось — переворачиваем вниз.
      top = t.bottom + GAP;
    } else if (top + h > window.innerHeight - EDGE) {
      top = t.top - h - GAP;
    }

    left = Math.min(Math.max(EDGE, left), window.innerWidth - w - EDGE);
    top = Math.min(Math.max(EDGE, top), window.innerHeight - h - EDGE);
    setPos({ top, left });
  }, [anchor, placement, label]);

  return createPortal(
    <div
      ref={box}
      id={id}
      role={describes ? 'tooltip' : undefined}
      aria-hidden={describes ? undefined : true}
      style={{ top: pos?.top ?? 0, left: pos?.left ?? 0 }}
      className={`pointer-events-none fixed z-[60] max-w-xs rounded-md bg-[var(--text)] px-2 py-1 text-xs text-white shadow-md transition-opacity duration-100 ${
        pos ? 'opacity-100' : 'opacity-0'
      }`}
    >
      {label}
    </div>,
    document.body,
  );
}

/**
 * Обёртка для случая, когда обработчики нельзя повесить на сам триггер:
 * выключенная кнопка не получает событий указателя, и подсказка «почему
 * недоступно» — единственное, что может объяснить, — не показалась бы.
 */
export function Tooltip({
  label,
  placement,
  describes = true,
  className = 'inline-flex',
  children,
}: {
  label: string | undefined;
  placement?: Placement;
  describes?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const { triggerProps, tooltip } = useTooltip(label, { placement, describes });

  return (
    <span className={className} {...triggerProps}>
      {children}
      {tooltip}
    </span>
  );
}
