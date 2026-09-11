import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  BookOpen,
  ChartNoAxesColumn,
  LogOut,
  Menu,
  Receipt,
  Settings,
  X,
} from 'lucide-react';
import { useLogout, useMe } from '../auth/useAuth';
import { cn } from '../ui/cn';
import { NAV_ITEMS, activeNav } from './nav';

/**
 * Бургер: полное дерево кабинета одним списком.
 *
 * На широком экране дублирует полосу — намеренно: сюда приходят те, кто
 * ищет, а не те, кто знает. На узком экране полоса скрыта, и бургер —
 * единственное меню. Служебное (настройки, аналитика, справка, выход)
 * живёт только здесь, чтобы не занимать место в полосе.
 */
export function BurgerMenu() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const active = activeNav(pathname);
  const me = useMe();
  const logout = useLogout();

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const link =
    'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-[var(--surface-sunken)]';

  return (
    <>
      <button
        type="button"
        aria-label="Меню"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="grid h-9 w-9 place-items-center rounded-lg text-[var(--text)] transition-colors hover:bg-[var(--surface-sunken)]"
      >
        <Menu size={20} strokeWidth={1.75} />
      </button>

      {open && (
        <div className="fixed inset-0 z-40" role="dialog" aria-label="Меню кабинета">
          <button
            type="button"
            aria-label="Закрыть меню"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-[var(--scrim)]"
          />
          <aside className="absolute inset-y-0 right-0 flex w-80 max-w-[88vw] flex-col bg-[var(--surface)] shadow-[var(--shadow-subtle)]">
            <div className="flex items-center gap-3 border-b border-[var(--line)] px-4 py-3">
              <span className="min-w-0 flex-1 truncate text-sm text-[var(--text-muted)]">
                {me.data?.email}
              </span>
              <button
                type="button"
                aria-label="Закрыть"
                onClick={() => setOpen(false)}
                className="grid h-9 w-9 place-items-center rounded-lg hover:bg-[var(--surface-sunken)]"
              >
                <X size={18} />
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto p-2">
              <Group title="Работа">
                {NAV_ITEMS.map((item) => (
                  <li key={item.key}>
                    <Link
                      to={item.to}
                      className={cn(
                        link,
                        active === item.key && 'bg-[var(--accent-soft)] font-medium text-[var(--accent)]',
                      )}
                    >
                      <item.icon size={17} strokeWidth={1.75} />
                      {item.label}
                    </Link>
                    <ul className="mb-1 ml-8 border-l border-[var(--line)] pl-2">
                      {item.children.map((c) => (
                        <li key={c.to}>
                          <Link
                            to={c.to}
                            className="block rounded-md px-2 py-1 text-sm text-[var(--text-muted)] hover:text-[var(--text)]"
                          >
                            {c.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </Group>

              <Group title="Служебное">
                <li>
                  <Link to="/settings" className={link}>
                    <Settings size={17} strokeWidth={1.75} />
                    Настройки
                  </Link>
                </li>
                <li>
                  <Link to="/analytics" className={link}>
                    <ChartNoAxesColumn size={17} strokeWidth={1.75} />
                    Аналитика
                  </Link>
                </li>
                {me.data?.isPlatform && (
                  <li>
                    <Link to="/invoices" className={link}>
                      <Receipt size={17} strokeWidth={1.75} />
                      Счета и заявки
                    </Link>
                  </li>
                )}
                <li>
                  <Link to="/docs" className={link}>
                    <BookOpen size={17} strokeWidth={1.75} />
                    База знаний
                  </Link>
                </li>
              </Group>
            </nav>

            <div className="border-t border-[var(--line)] p-2">
              <button
                type="button"
                onClick={() => logout.mutate()}
                className={cn(link, 'w-full text-[var(--text-muted)]')}
              >
                <LogOut size={17} strokeWidth={1.75} />
                Выйти
              </button>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <div className="px-3 pb-1 pt-2 text-[length:var(--text-caption)] font-medium uppercase tracking-[.06em] text-[var(--text-muted)]">
        {title}
      </div>
      <ul>{children}</ul>
    </div>
  );
}
