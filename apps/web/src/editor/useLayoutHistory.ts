import { useCallback, useRef, useState } from 'react';
import type { SheetLayout } from '@gramota/shared';

const MAX_HISTORY = 50;

/**
 * Макет с историей отмены. Снимки складываются целиком: макет — это десятки
 * небольших объектов, поэтому копия дешевле, чем описание обратных операций.
 *
 * commit=false нужен для непрерывных жестов: во время перетаскивания состояние
 * обновляется каждый кадр, но в историю попадает только результат по отпусканию
 * кнопки — иначе одна отмена откатывала бы лишь один кадр движения.
 */
export function useLayoutHistory(initial: SheetLayout) {
  const [layout, setLayoutState] = useState<SheetLayout>(initial);
  const past = useRef<SheetLayout[]>([]);
  const future = useRef<SheetLayout[]>([]);
  const [version, setVersion] = useState(0);

  /*
   * Длины стопок держим ещё и в состоянии.
   *
   * Сами стопки живут в ref — их нельзя пересоздавать на каждый кадр
   * перетаскивания. Но кнопкам «Отменить» и «Вернуть» нужно знать, есть ли
   * что отменять, а изменение ref перерисовку не вызывает: кнопка осталась бы
   * активной, когда отменять уже нечего, и наоборот. Нажатие в пустоту
   * выглядит как «кнопка не работает» — ровно так это и было воспринято.
   */
  const [depth, setDepth] = useState({ past: 0, future: 0 });
  const syncDepth = useCallback(
    () => setDepth({ past: past.current.length, future: future.current.length }),
    [],
  );

  const setLayout = useCallback(
    (next: SheetLayout | ((prev: SheetLayout) => SheetLayout), commit = true) => {
      setLayoutState((prev) => {
        const value = typeof next === 'function' ? next(prev) : next;
        if (commit) {
          past.current = [...past.current, prev].slice(-MAX_HISTORY);
          future.current = [];
        }
        return value;
      });
      if (commit) {
        setVersion((v) => v + 1);
        syncDepth();
      }
    },
    [syncDepth],
  );

  /**
   * Запомнить состояние до начала жеста. Вызывается на первом реальном
   * перемещении, а не по нажатию кнопки: иначе обычный клик по блоку
   * засорял бы историю шагами, которые ничего не меняют.
   */
  const beginGesture = useCallback(() => {
    setLayoutState((prev) => {
      past.current = [...past.current, prev].slice(-MAX_HISTORY);
      future.current = [];
      return prev;
    });
    syncDepth();
  }, [syncDepth]);

  /**
   * Завершить жест. Двигает счётчик версии — именно по нему срабатывает
   * автосохранение, а промежуточные кадры перетаскивания его не трогают.
   */
  const endGesture = useCallback(() => setVersion((v) => v + 1), []);

  const undo = useCallback(() => {
    setLayoutState((prev) => {
      const previous = past.current.at(-1);
      if (!previous) return prev;
      past.current = past.current.slice(0, -1);
      future.current = [prev, ...future.current];
      return previous;
    });
    setVersion((v) => v + 1);
    syncDepth();
  }, [syncDepth]);

  const redo = useCallback(() => {
    setLayoutState((prev) => {
      const next = future.current[0];
      if (!next) return prev;
      future.current = future.current.slice(1);
      past.current = [...past.current, prev];
      return next;
    });
    setVersion((v) => v + 1);
    syncDepth();
  }, [syncDepth]);

  /**
   * Загрузка макета с сервера: история при этом обнуляется.
   *
   * Вызывать это можно только при смене листа. Раньше сброс висел на объекте
   * листа целиком, а он пересоздаётся при каждом ответе сервера — и любое
   * обновление данных (например, после загрузки бланка) стирало всю историю
   * правок. Человек нажимал «Отменить» и не понимал, почему ничего
   * не происходит.
   */
  const reset = useCallback(
    (value: SheetLayout) => {
      past.current = [];
      future.current = [];
      setLayoutState(value);
      syncDepth();
    },
    [syncDepth],
  );

  return {
    layout,
    setLayout,
    beginGesture,
    endGesture,
    undo,
    redo,
    reset,
    version,
    canUndo: depth.past > 0,
    canRedo: depth.future > 0,
  };
}
