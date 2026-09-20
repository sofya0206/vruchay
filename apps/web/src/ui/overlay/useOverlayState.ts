import { useEffect, useState } from 'react';

/**
 * Жизнь всплывающего слоя чуть длиннее, чем он открыт: иначе уходить
 * ему некуда. `mounted` — есть ли в разметке, `shown` — стоит ли уже
 * в конечном положении (включается со следующего кадра, чтобы браузер
 * увидел начальное). Переходы задаёт сам слой — здесь только время.
 */
export function useOverlayState(open: boolean, exitMs: number): { mounted: boolean; shown: boolean } {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      const frame = requestAnimationFrame(() => setShown(true));
      return () => cancelAnimationFrame(frame);
    }
    setShown(false);
    const timer = setTimeout(() => setMounted(false), exitMs);
    return () => clearTimeout(timer);
  }, [open, exitMs]);

  return { mounted, shown };
}

/**
 * Страницу под модальным слоем не прокручиваем: на iOS она едет вслед
 * за пальцем. Возвращаем как было, когда слой уходит.
 */
export function useScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const root = document.documentElement;
    const before = root.style.overflow;
    root.style.overflow = 'hidden';
    return () => {
      root.style.overflow = before;
    };
  }, [active]);
}

/**
 * Фокус — на первое поле, а не на крестик «Закрыть»: человек открыл окно,
 * чтобы что-то ввести или подтвердить. Нативный `<dialog>` сам ставит
 * фокус внутрь и возвращает опенеру при закрытии, но выбирает первый
 * попавшийся элемент.
 */
export function focusFirst(root: HTMLElement | null): void {
  if (!root) return;
  const list = Array.from(
    root.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((el) => el.offsetParent !== null);
  const first = list.find((el) => el.getAttribute('aria-label') !== 'Закрыть') ?? list[0] ?? root;
  first.focus({ preventScroll: true });
}
