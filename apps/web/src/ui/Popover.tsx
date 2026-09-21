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
  const [box, setBox] = useState<{
    left?: number;
    right?: number;
    top?: number;
    bottom?: number;
    width?: number;
    room: number;
    sheet: boolean;
  } | null>(null);

  useLayoutEffect(() => {
    if (!open) return;

    const place = () => {
      const trigger = anchor.current;
      if (!trigger) return;

      /*
       * На сенсорном экране слой становится нижним листом во всю ширину:
       * дотянуться большим пальцем до списка у верхнего края телефона
       * нельзя. Спрашиваем браузер прямо здесь, а не классом: встроенные
       * стили положения всё равно сильнее классов, а в предварительную
       * отрисовку слой не попадает — закрытый он ничего не рисует.
       */
      if (window.matchMedia('(pointer: coarse)').matches) {
        setBox({ left: 0, right: 0, bottom: 0, room: Math.max(180, window.innerHeight * 0.6), sheet: true });
        return;
      }

      const rect = trigger.getBoundingClientRect();
      const w = width === 'anchor' || width === undefined ? rect.width : width;

      /*
       * Упор в край окна считаем руками — библиотеки размещения в проекте
       * нет, а случаев ровно два: не дать слою уехать за правый край
       * и перевернуть его вверх, когда внизу не осталось места.
       */
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - w - 8));
      const below = window.innerHeight - rect.bottom - 8;
      const above = rect.top - 8;

      /*
       * Переворачиваем по настоящей высоте слоя, когда она уже известна.
       * На первом проходе слоя ещё нет — берём осторожную оценку, а сразу
       * после отрисовки считаем заново: иначе календарь у нижнего края
       * окна оставался бы внизу и прокручивался вместо того, чтобы
       * раскрыться вверх, где место есть.
       */
      const height = panelRef.current?.offsetHeight ?? 240;
      const up = below < height && above > below;

      /*
       * Место под слой: не меньше 180 точек, иначе у поля в самом низу
       * окна список схлопнулся бы в полоску, — но и не больше самого
       * окна. Дальше слой ещё и придвигается к краю, если по своей
       * высоте в отведённое место не уложился: раньше нижняя часть
       * календаря вместе с «Сегодня» и «Очистить» просто оказывалась
       * за экраном, и нажать их было нечем.
       */
      const vh = window.innerHeight;
      const room = Math.min(vh - 16, Math.max(180, up ? above : below));
      const fits = Math.min(height, room);
      const clamp = (value: number) => Math.max(8, Math.min(value, vh - 8 - fits));

      /*
       * Вверх переворачиваем через bottom, а не через top. С top слой
       * по-прежнему рос бы вниз — от верхнего края поля, — и поле у низа
       * окна открывало бы список за экраном. Высоту слоя на этот момент
       * ещё никто не знает, а bottom её знать и не требует.
       */
      setBox({
        left,
        width: w,
        room,
        sheet: false,
        ...(up ? { bottom: clamp(vh - rect.top + 4) } : { top: clamp(rect.bottom + 4) }),
      });
    };

    place();
    // Второй проход — уже с измеренным слоем (см. про высоту выше).
    const again = requestAnimationFrame(place);
    // Захват нужен, чтобы ловить прокрутку вложенных колонок, а не только окна.
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      cancelAnimationFrame(again);
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open, anchor, width, panelRef]);

  if (!open || !box) return null;

  return createPortal(
    <div
      ref={panelRef}
      data-ui-popover
      role={role}
      aria-labelledby={labelledBy}
      aria-activedescendant={activeDescendant}
      /*
       * Своего отступа у слоя нет. Раньше он был (py-1) и складывался
       * с отступом содержимого — у списка выходило 4px внешнего зазора
       * плюс 4px пустоты внутри панели, и на коротком списке вроде
       * «Альбомная / Книжная» это читалось как лишняя пустая полоса
       * над первым пунктом. У списка (Select.tsx) своего паддинга нет
       * вовсе — единственный зазор теперь внешний, между полем и слоем.
       * У календаря и палитры содержимое несёт свой паддинг само.
       * Скруглённый угол при этом не остаётся острым: overflow-auto
       * обрезает содержимое по той же дуге, что и рамка.
       */
      className={
        'fixed z-[60] overflow-auto bg-raised shadow-md ring-1 ring-line ' +
        // Нижний лист на телефоне у самого края экрана — здесь запас снизу
        // нужен: без него последний пункт упирался бы в границу экрана.
        (box.sheet ? 'rounded-t-sheet pb-[max(8px,env(safe-area-inset-bottom))]' : 'vru-pop-in rounded-card')
      }
      /*
       * Предел высоты — по месту, которое реально осталось, а не постоянное
       * число: у длинного списка шрифтов прокрутка уместна, а календарь от
       * постоянного предела обрезался посреди месяца.
       */
      style={{
        left: box.left,
        right: box.right,
        top: box.top,
        bottom: box.bottom,
        width: box.width,
        maxHeight: box.room,
      }}
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
