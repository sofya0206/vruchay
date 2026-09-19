import { useEffect, useState } from 'react';

/**
 * Посадочная экранами: одна секция — один экран.
 *
 * Прокрутка «прилипает» к началу секции силами браузера (scroll-snap),
 * без библиотек вроде fullPage.js: те перехватывают колесо и клавиши,
 * ломают поиск по странице и якоря, а на телефоне спорят с адресной
 * строкой. Родное прилипание всё это оставляет браузеру.
 *
 * Прилипание живёт на корневом элементе документа, а не на обёртке
 * страницы: иначе посадочная стала бы собственным контейнером прокрутки,
 * и адресная строка на телефоне перестала бы прятаться.
 */
export function useSnapScroll() {
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.snap = 'y';
    return () => {
      delete root.dataset.snap;
    };
  }, []);
}

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

export interface Screen {
  id: string;
  label: string;
}

/**
 * Точки экранов у правого края: показывают, сколько экранов и где человек.
 *
 * Текущий экран определяется по тому, какая секция занимает больше
 * половины окна. Точки скрыты на узких экранах: там секции длиннее окна,
 * и «один экран — одна точка» перестаёт быть правдой.
 */
export function ScreenDots({ screens }: { screens: Screen[] }) {
  const [active, setActive] = useState(screens[0]?.id);

  useEffect(() => {
    if (!('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(entry.target.id);
        }
      },
      { threshold: 0.5 },
    );
    screens.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [screens]);

  return (
    <nav className="vru-dots" aria-label="Экраны страницы">
      {screens.map((s) => (
        <a
          key={s.id}
          href={`#${s.id}`}
          className="vru-dots__dot"
          aria-current={active === s.id ? 'true' : undefined}
          aria-label={s.label}
        >
          <span className="vru-dots__label">{s.label}</span>
        </a>
      ))}
    </nav>
  );
}
