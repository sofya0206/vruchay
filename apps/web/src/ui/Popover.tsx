import { useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode, RefObject } from 'react';

/**
 * Всплывающий слой под кнопкой-триггером.
 *
 * Рисуется порталом в body, а не на месте. Поля живут в прокручиваемой
 * колонке свойств, в приклеенных шапках таблиц и в панели разделов —
 * приклеенный блок заводит свой контекст наложения, и никакое z-50
 * внутри него не спасает (разбор — LibraryNav.tsx:234). Прокрутка
 * вдобавок просто срезала бы слой по краю колонки.
 *
 * Позиция считается от прямоугольника триггера и пересчитывается на
 * прокрутку и изменение размера окна: слой стоит по координатам, а не
 * внутри потока, и вместе со страницей не едет.
 *
 * На сенсорном экране слой становится нижним листом во всю ширину.
 * Это один и тот же код: разница задана вариантом `pointer-coarse`,
 * а не ветвлением в JS. Определять «это телефон» скриптом нельзя —
 * публичные страницы предварительно отрисовываются в статику, и в неё
 * попал бы вариант той машины, что собирала.
 */
export function Popover({
  open,
  anchor,
  panelRef,
  role,
  labelledBy,
  activeDescendant,
  width,
  children,
}: {
  open: boolean;
  anchor: RefObject<HTMLElement | null>;
  panelRef: RefObject<HTMLDivElement | null>;
  role?: 'listbox' | 'dialog';
  labelledBy?: string;
  activeDescendant?: string;
  /** `anchor` — во всю ширину поля, так ведёт себя выпадающий список. */
  width?: 'anchor' | number;
  children: ReactNode;
}) {
  const [box, setBox] = useState<{ left: number; top: number; width: number } | null>(null);

  useLayoutEffect(() => {
    if (!open) return;

    const place = () => {
      const trigger = anchor.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const w = width === 'anchor' || width === undefined ? rect.width : width;

      /*
       * Упор в край окна считаем руками — библиотеки размещения в проекте
       * нет, а случай ровно один: не дать слою уехать за правый край и
       * перевернуть его вверх, когда внизу не осталось места.
       */
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - w - 8));
      const below = window.innerHeight - rect.bottom;
      const top = below < 220 && rect.top > below ? rect.top - 4 : rect.bottom + 4;

      setBox({ left, top, width: w });
    };

    place();
    // Захват нужен, чтобы ловить прокрутку вложенных колонок, а не только окна.
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open, anchor, width]);

  if (!open || !box) return null;

  return createPortal(
    <div
      ref={panelRef}
      data-ui-popover
      role={role}
      aria-labelledby={labelledBy}
      aria-activedescendant={activeDescendant}
      className={
        'fixed z-50 max-h-72 overflow-auto rounded-xl bg-[var(--surface)] py-1 ' +
        'shadow-lg ring-1 ring-[var(--line)] ' +
        'pointer-coarse:inset-x-0 pointer-coarse:top-auto pointer-coarse:bottom-0 ' +
        'pointer-coarse:max-h-[60vh] pointer-coarse:w-auto pointer-coarse:rounded-b-none'
      }
      style={{ left: box.left, top: box.top, width: box.width }}
      /*
       * Нажатие внутри слоя не уводит фокус.
       *
       * Панель оформления висит над блоком, который правят в редакторе
       * текста: уйди фокус из него — гаснет выделение, и «сделать
       * выделенное полужирным» превращается в «сделать полужирным ничто».
       * Нативный список это переживал только потому, что панель гасит
       * нажатие у себя, а браузер всё равно открывал список. Своей
       * выпадашке такой поблажки нет — гасим сами. Щелчок при этом не
       * отменяется, выбор пункта работает как обычно.
       */
      onPointerDown={(e) => e.preventDefault()}
    >
      {children}
    </div>,
    document.body,
  );
}
