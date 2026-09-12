import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

/**
 * Закрытие всплывающего слоя: нажатие мимо него и Escape.
 *
 * Один хук вместо пяти копий одного и того же useEffect — они успели
 * разойтись сами собой: часть слушала `pointerdown`, часть `mousedown`,
 * и на сенсорном экране вторая часть закрывалась через раз.
 *
 * Зон две и больше намеренно. Слой уходит порталом в body — иначе его
 * срезает прокруткой колонки свойств или прячет под карточками
 * приклеенный контекст наложения (разбор — LibraryNav.tsx:234). Проверка
 * «внутри ли нажатие» только по кнопке-триггеру закрывала бы список
 * первым же щелчком по его пункту: пункт лежит в другом поддереве.
 *
 * Смену маршрута сюда не тянем: `useLocation` работает только внутри
 * роутера, а поля формы рисуются и без него — `field-width.test.tsx`
 * гонит их через серверный рендер. Кому нужно, закрывает сам, одной
 * строкой, как `AccountMenu.tsx:24`.
 */
export function useDismiss(
  open: boolean,
  onClose: () => void,
  ...zones: RefObject<HTMLElement | null>[]
): void {
  /*
   * Свежие значения без перезаписи слушателей. Массив зон и обработчик
   * создаются заново на каждом рендере: возьми мы их списком зависимостей,
   * подписка снималась бы и ставилась впустую на каждую перерисовку.
   */
  const latest = useRef({ onClose, zones });
  latest.current = { onClose, zones };

  useEffect(() => {
    if (!open) return;

    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (latest.current.zones.some((z) => z.current?.contains(target))) return;
      latest.current.onClose();
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      /*
       * Escape гасим здесь же. Холст редактора и оболочка кабинета тоже
       * слушают эту клавишу, и без остановки один промах при открытом
       * списке уводил бы из материала целиком.
       */
      e.stopPropagation();
      latest.current.onClose();
    };

    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
}
