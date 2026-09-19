import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { BookOpen, Gift, House, LifeBuoy, Menu, Settings, X } from 'lucide-react';
import { IconButton } from '../ui/IconButton';
import { cn } from '../ui/cn';
import { NAV_ITEMS, activeNav } from './nav';
import { LearnNavItem } from '../onboarding/LearnNavItem';

/**
 * Разделы на узком экране — тот же список, что в колонке слева на широком.
 *
 * Только там: на широком колонка стоит всегда, и бургер рядом с ней был
 * бы её зеркалом. Подпункты показаны здесь — на телефоне внутренних
 * колонок разделов нет, и до папки писем иначе не добраться.
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

  const row = (isActive: boolean) =>
    cn(
      'flex h-11 items-center gap-3 rounded-lg px-3 text-base transition-colors',
      isActive
        ? 'bg-[var(--accent-soft)] font-medium text-[var(--accent)]'
        : 'text-[var(--text)] hover:bg-[var(--surface-sunken)]',
    );

  return (
    <div className="md:hidden">
      <IconButton label="Разделы" aria-expanded={open} onClick={() => setOpen(true)}>
        <Menu size={22} strokeWidth={1.75} />
      </IconButton>

      {open && (
        <div className="fixed inset-0 z-40" role="dialog" aria-label="Разделы">
          <button
            type="button"
            aria-label="Закрыть"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-[var(--scrim)]"
          />
          <aside className="absolute inset-y-0 left-0 flex w-80 max-w-[88vw] flex-col bg-[var(--surface)] shadow-lg">
            <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
              <span className="font-medium">Разделы</span>
              <IconButton label="Закрыть" size="sm" onClick={() => setOpen(false)}>
                <X size={20} />
              </IconButton>
            </div>

            <nav className="flex-1 overflow-y-auto p-2">
              <ul className="flex flex-col gap-0.5">
                <li>
                  <Link to="/" className={row(pathname === '/')}>
                    <House size={20} strokeWidth={1.75} />
                    Главная
                  </Link>
                </li>
                {NAV_ITEMS.map((item) => (
                  <li key={item.key}>
                    <Link to={item.to} className={row(active === item.key)}>
                      <item.icon size={20} strokeWidth={1.75} />
                      {item.label}
                    </Link>
                    {item.children.length > 1 && (
                      <ul className="mb-1 ml-9 border-l border-[var(--line)] pl-2">
                        {item.children.map((c) => (
                          <li key={c.to}>
                            <Link
                              to={c.to}
                              className="block rounded-lg px-2 py-2 text-sm text-[var(--text-muted)] hover:text-[var(--text)]"
                            >
                              {c.label}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            </nav>

            <div className="border-t border-[var(--line)] p-2">
              <Link to="/settings" className={row(pathname.startsWith('/settings'))}>
                <Settings size={20} strokeWidth={1.75} />
                Настройки
              </Link>
              <Link to="/docs" className={row(pathname.startsWith('/docs'))}>
                <BookOpen size={20} strokeWidth={1.75} />
                База знаний
              </Link>
              <LearnNavItem onDone={() => setOpen(false)} />
              <Link to="/support" className={row(pathname.startsWith('/support'))}>
                <LifeBuoy size={20} strokeWidth={1.75} />
                Поддержка
              </Link>
              <Link to="/referral" className={row(pathname.startsWith('/referral'))}>
                <Gift size={20} strokeWidth={1.75} />
                Пригласить друга
              </Link>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
