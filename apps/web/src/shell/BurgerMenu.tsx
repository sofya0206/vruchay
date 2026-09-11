import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { cn } from '../ui/cn';
import { NAV_ITEMS, activeNav } from './nav';

/**
 * Разделы на узком экране.
 *
 * Только там: на широком полоса стоит в шапке, и бургер рядом с ней был
 * бы её зеркалом — два списка из одних и тех же пяти слов, между которыми
 * человеку незачем выбирать. Служебное здесь тоже не живёт: оно в меню
 * учётной записи, одинаково на любой ширине.
 */
export function BurgerMenu() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const active = activeNav(pathname);

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-label="Разделы"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="grid h-10 w-10 place-items-center rounded-lg text-[var(--text)] transition-colors hover:bg-[var(--surface-sunken)]"
      >
        <Menu size={22} strokeWidth={1.75} />
      </button>

      {open && (
        <div className="fixed inset-0 z-40" role="dialog" aria-label="Разделы">
          <button
            type="button"
            aria-label="Закрыть"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-[var(--scrim)]"
          />
          <aside className="absolute inset-y-0 left-0 flex w-80 max-w-[88vw] flex-col bg-[var(--surface)] shadow-[var(--shadow-subtle)]">
            <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
              <span className="font-medium">Разделы</span>
              <button
                type="button"
                aria-label="Закрыть"
                onClick={() => setOpen(false)}
                className="grid h-9 w-9 place-items-center rounded-lg hover:bg-[var(--surface-sunken)]"
              >
                <X size={20} />
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto p-2">
              <ul>
                {NAV_ITEMS.map((item) => (
                  <li key={item.key} className="mb-1">
                    <Link
                      to={item.to}
                      className={cn(
                        'flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-[15px] transition-colors hover:bg-[var(--surface-sunken)]',
                        active === item.key && 'bg-[var(--accent-soft)] font-medium text-[var(--accent)]',
                      )}
                    >
                      <item.icon size={18} strokeWidth={1.75} />
                      {item.label}
                    </Link>
                    <ul className="ml-9 border-l border-[var(--line)] pl-2">
                      {item.children.map((c) => (
                        <li key={c.to}>
                          <Link
                            to={c.to}
                            className="block rounded-md px-2 py-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--text)]"
                          >
                            {c.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </nav>
          </aside>
        </div>
      )}
    </div>
  );
}
