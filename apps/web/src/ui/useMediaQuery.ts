import { useEffect, useState, useSyncExternalStore } from 'react';

/**
 * Подписка на медиазапрос.
 *
 * Только для экранов кабинета. Публичные страницы проходят предварительную
 * отрисовку в статику (prerender.mjs), и вариант машины, которая собирала,
 * попал бы в разметку — там раскладку задают классами Tailwind (`max-md:`,
 * `pointer-coarse:`), а не этим хуком.
 *
 * `addListener` — запас для Safari 13: `addEventListener` у списка
 * медиазапросов появился только в 14-м, а старые айфоны ещё в ходу.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      if (list.addEventListener) list.addEventListener('change', onChange);
      else list.addListener(onChange);
      return () => {
        if (list.removeEventListener) list.removeEventListener('change', onChange);
        else list.removeListener(onChange);
      };
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/**
 * Узкий экран — телефон. Та же граница, что у `md:` в Tailwind: раскладка
 * в JS и в классах переключается в одной точке, а не в двух соседних.
 */
export const PHONE_QUERY = '(max-width: 767.98px)';

export function usePhone(): boolean {
  return useMediaQuery(PHONE_QUERY);
}

/**
 * Сколько снизу закрыто экранной клавиатурой, в CSS-пикселях.
 *
 * Android с `interactive-widget=resizes-content` сам ужимает страницу,
 * а Safari на iOS — нет: клавиатура ложится поверх, и приклеенная к низу
 * панель уходит под неё. Видимую часть окна знает только `visualViewport`,
 * по нему и считаем. Где его нет (совсем старые браузеры) — ноль: панель
 * останется внизу, как и была.
 */
/**
 * Видимая часть окна: сверху и высота, за вычетом экранной клавиатуры.
 *
 * Для слоя во весь экран, в котором печатают: приклеенный к окну слой на iOS
 * уходит низом под клавиатуру, а при фокусе поля ещё и съезжает вместе
 * с прокруткой, которую Safari делает сам.
 */
export function useVisualViewport(): { top: number; height: number } {
  const [box, setBox] = useState(() => ({
    top: 0,
    height: typeof window === 'undefined' ? 0 : window.innerHeight,
  }));
  useEffect(() => {
    const vv = window.visualViewport;
    const update = () =>
      setBox(vv ? { top: vv.offsetTop, height: vv.height } : { top: 0, height: window.innerHeight });
    update();
    if (!vv) {
      window.addEventListener('resize', update);
      return () => window.removeEventListener('resize', update);
    }
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);
  return box;
}

export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => setInset(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)));
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);
  return inset;
}
