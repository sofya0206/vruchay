import { useEffect } from 'react';

/**
 * Появление содержимого при входе экрана в поле зрения.
 *
 * Элементы с классом `vru-reveal` получают `is-in`, когда показаны хотя бы
 * на пятую часть, и больше не отслеживаются: повторное появление при
 * прокрутке назад раздражает — человек уже это видел.
 *
 * Без IntersectionObserver (старый браузер, тесты) всё показывается сразу:
 * скрытое навсегда содержимое хуже, чем содержимое без анимации.
 */
export function useReveal() {
  useEffect(() => {
    const nodes = Array.from(document.querySelectorAll<HTMLElement>('.vru-reveal'));
    if (!('IntersectionObserver' in window)) {
      nodes.forEach((n) => n.classList.add('is-in'));
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add('is-in');
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.2 },
    );
    nodes.forEach((n) => observer.observe(n));
    return () => observer.disconnect();
  }, []);
}
