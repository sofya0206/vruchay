import { useEffect, useState, type ReactNode } from 'react';
import { cn } from './cn';

/**
 * Раскрывающийся блок в потоке страницы.
 *
 * Высота содержимого заранее неизвестна, а `height: auto` не анимируется,
 * поэтому раскрытие идёт через `grid-template-rows: 0fr → 1fr` — единственный
 * способ плавно вырасти до естественной высоты без замера в JavaScript
 * и без потолка `max-height`, который либо режет содержимое, либо тянет
 * анимацию в пустоту. Контент, лежащий ниже, съезжает вместе с блоком,
 * а не прыгает на готовую высоту.
 *
 * Детей оставляем в дереве после первого раскрытия: иначе схлопывание
 * нечему было бы анимировать. Скрытое содержимое выключено для клавиатуры
 * и читалки через `inert`.
 *
 * Под `prefers-reduced-motion` переход гасит общее правило в index.css.
 */
export function Collapse({
  open,
  children,
  className = '',
}: {
  open: boolean;
  children: ReactNode;
  className?: string;
}) {
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) setMounted(true);
  }, [open]);

  return (
    <div
      className={cn(
        'grid transition-[grid-template-rows] duration-200 ease-out',
        open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        className,
      )}
      aria-hidden={!open}
    >
      <div className="min-h-0 overflow-hidden" inert={!open}>
        {mounted ? children : null}
      </div>
    </div>
  );
}
