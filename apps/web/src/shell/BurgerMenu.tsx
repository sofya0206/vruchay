import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { House, Menu as MenuIcon, Settings } from 'lucide-react';
import { IconButton } from '../ui/IconButton';
import { Sheet } from '../ui/Sheet';
import { cn } from '../ui/cn';
import { HELP_PATHS, helpItems } from './help-items';
import { NAV_ITEMS, activeNav } from './nav';

/**
 * Разделы на узком экране — тот же список, что в колонке слева на широком.
 *
 * Только там: на широком колонка стоит всегда, и бургер рядом с ней был
 * бы её зеркалом. Подпункты показаны здесь — на телефоне внутренних
 * колонок разделов нет. Помощь — из того же списка, что и меню «Помощь».
 */
export function BurgerMenu() {
  const [open, setOpen] = useState(false);
  const { pathname, search } = useLocation();
  const active = activeNav(pathname);

  useEffect(() => setOpen(false), [pathname]);

  const row = (isActive: boolean) =>
    cn(
      'pressable flex h-11 items-center gap-3 rounded-control px-3 text-base',
      isActive ? 'bg-accent-soft font-medium text-accent' : 'text-ink active:bg-sunken',
    );

  return (
    <div className="md:hidden">
      <IconButton label="Разделы" aria-expanded={open} onClick={() => setOpen(true)}>
        <MenuIcon size={22} strokeWidth={1.75} />
      </IconButton>

      <Sheet open={open} onClose={() => setOpen(false)} title="Разделы" side="left" width="sm" className="p-0">
        <nav className="-m-4 p-2">
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
                <ul className="mb-1 ml-9 border-l border-line pl-2">
                  {item.children.map((c) => (
                    <li key={c.to}>
                      <Link to={c.to} className="block rounded-control px-2 py-2 text-sm text-muted active:text-ink">
                        {c.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>

          <div className="mt-2 flex flex-col gap-0.5 border-t border-line pt-2">
            <Link to="/settings" className={row(pathname.startsWith('/settings'))}>
              <Settings size={20} strokeWidth={1.75} />
              Настройки
            </Link>
            {helpItems(pathname, search).map((item, i) =>
              item.kind === 'divider' ? null : item.kind === 'link' ? (
                <Link key={item.to} to={item.to} className={row(HELP_PATHS.some((p) => item.to.startsWith(p) && pathname.startsWith(p)))}>
                  <item.icon size={20} strokeWidth={1.75} />
                  {item.label}
                </Link>
              ) : (
                <button
                  key={`${item.label}-${i}`}
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    item.run();
                  }}
                  className={cn(row(false), 'w-full text-left')}
                >
                  <item.icon size={20} strokeWidth={1.75} />
                  {item.label}
                </button>
              ),
            )}
          </div>
        </nav>
      </Sheet>
    </div>
  );
}
