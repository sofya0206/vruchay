import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { BookOpen, ChartNoAxesColumn, LogOut, Receipt, Settings } from 'lucide-react';
import { useLogout, useMe } from '../auth/useAuth';

/**
 * Учётная запись и служебное — одним меню под кружком справа.
 *
 * Настройки, аналитика, счета и справка в полосу не входят: за ними
 * приходят раз в неделю, а место наверху стоит дорого. Отдельной кнопки
 * им тоже не нужно — рядом с кружком учётной записи она читалась как
 * второй такой же кружок, и человек выбирал между двумя одинаковыми
 * углами. Теперь угол один.
 */
export function AccountMenu() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const me = useMe();
  const logout = useLogout();
  const root = useRef<HTMLDivElement>(null);

  const person = me.data?.name?.trim() || me.data?.email || '';

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

  const item =
    'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[15px] text-[var(--text)] transition-colors hover:bg-[var(--surface-sunken)]';

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Учётная запись"
        title={person}
        onClick={() => setOpen(!open)}
        className="grid h-11 w-11 place-items-center rounded-full bg-[var(--surface-sunken)] text-base font-medium text-[var(--text-muted)] transition-colors hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]"
      >
        {person.slice(0, 1).toUpperCase() || '·'}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-1 w-60 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-1.5 shadow-[var(--shadow-subtle)]"
        >
          <div className="truncate px-2.5 pb-2 pt-1 text-sm text-[var(--text-muted)]">
            {me.data?.email}
          </div>

          <Link role="menuitem" to="/settings" className={item}>
            <Settings size={17} strokeWidth={1.75} />
            Настройки
          </Link>
          <Link role="menuitem" to="/registry?tab=analytics" className={item}>
            <ChartNoAxesColumn size={17} strokeWidth={1.75} />
            Аналитика
          </Link>
          {me.data?.isPlatform && (
            <Link role="menuitem" to="/invoices" className={item}>
              <Receipt size={17} strokeWidth={1.75} />
              Счета и заявки
            </Link>
          )}
          <Link role="menuitem" to="/docs" className={item}>
            <BookOpen size={17} strokeWidth={1.75} />
            База знаний
          </Link>

          <div className="my-1.5 h-px bg-[var(--line)]" />

          <button
            type="button"
            role="menuitem"
            onClick={() => logout.mutate()}
            className={`${item} w-full text-[var(--text-muted)]`}
          >
            <LogOut size={17} strokeWidth={1.75} />
            Выйти
          </button>
        </div>
      )}
    </div>
  );
}
