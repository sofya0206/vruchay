import {
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';
import { Link, useLocation } from 'react-router-dom';
import { BottomSheet } from './BottomSheet';
import { cn } from './cn';
import { useMediaQuery } from './useMediaQuery';

/**
 * Выпадающее меню — одно на кабинет.
 *
 * Кнопка-триггер и список под ней. Закрывается по Esc, по клику вне,
 * при смене адреса и после выбора пункта. Пункты — `MenuItem` (кнопка
 * или ссылка) и `MenuDivider`; заголовок-подпись — `MenuLabel`.
 *
 * На сенсорном экране список выезжает нижним листом: кнопка «…» стоит
 * у верхнего края, и выпадашка под ней открывалась там, куда большой
 * палец не достаёт. Признак — грубый указатель, а не ширина окна:
 * планшету с пальцем лист нужен так же, как телефону.
 */
export function Menu({
  trigger,
  children,
  align = 'right',
  className = '',
  title = 'Действия',
}: {
  /** Рисует кнопку: получает открыт ли список и обработчик нажатия. */
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  children: ReactNode;
  align?: 'left' | 'right';
  className?: string;
  /** Заголовок нижнего листа на сенсорном экране. */
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const root = useRef<HTMLDivElement>(null);
  const touch = useMediaQuery('(pointer: coarse)');

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const closeOnPick = (e: React.MouseEvent) => {
    // Любой выбранный пункт закрывает меню; разделители и подписи — нет.
    if ((e.target as HTMLElement).closest('[role="menuitem"]')) setOpen(false);
  };

  if (touch) {
    return (
      <div ref={root} className={cn('relative', className)}>
        {trigger({ open, toggle: () => setOpen((v) => !v) })}
        <BottomSheet open={open} onClose={() => setOpen(false)} title={title}>
          <div role="menu" onClick={closeOnPick}>
            {children}
          </div>
        </BottomSheet>
      </div>
    );
  }

  return (
    <div ref={root} className={cn('relative', className)}>
      {trigger({ open, toggle: () => setOpen((v) => !v) })}
      {open && (
        <div
          role="menu"
          onClick={(e) => {
            // Любой выбранный пункт закрывает меню; разделители и подписи — нет.
            if ((e.target as HTMLElement).closest('[role="menuitem"]')) setOpen(false);
          }}
          className={cn(
            'card absolute top-full z-30 mt-1 min-w-56 bg-[var(--surface-raised)] p-1.5 shadow-lg',
            align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}

const itemClass =
  'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[15px] text-[var(--text)] transition-colors hover:bg-[var(--surface-sunken)] disabled:opacity-50 disabled:hover:bg-transparent ' +
  // Под палец: 48 точек в высоту, как у пунктов системных листов.
  'pointer-coarse:min-h-12 pointer-coarse:px-3 pointer-coarse:text-base';

export function MenuItem({
  icon,
  to,
  danger,
  children,
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: ReactNode;
  /** Ссылка вместо кнопки. */
  to?: string;
  danger?: boolean;
}) {
  const cls = cn(itemClass, danger && 'text-[var(--danger)] hover:bg-[var(--danger-soft)]', className);
  if (to) {
    return (
      <Link role="menuitem" to={to} className={cls}>
        {icon}
        {children}
      </Link>
    );
  }
  return (
    <button type="button" role="menuitem" className={cls} {...rest}>
      {icon}
      {children}
    </button>
  );
}

export function MenuDivider() {
  return <div className="my-1.5 h-px bg-[var(--line)]" />;
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <div className="truncate px-2.5 pt-1 pb-2 text-sm text-[var(--text-muted)]">{children}</div>;
}
