import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import { useFolders } from '../api/folders';
import { cn } from '../ui/cn';
import { NAV_ITEMS, activeNav, type NavChild, type NavItem } from './nav';

/**
 * Верхняя полоса: пять пунктов, у каждого выпадающие подстраницы.
 *
 * Раскрытие — по нажатию, а не по наведению: на тач-экране наведения нет,
 * а на ноутбуке случайное наведение открывало бы меню при каждом проходе
 * курсора к поиску. Открытое меню закрывается нажатием мимо, Escape
 * и любым переходом.
 */
export function TopNav() {
  const { pathname } = useLocation();
  const active = activeNav(pathname);
  const [open, setOpen] = useState<NavItem['key'] | null>(null);
  const root = useRef<HTMLElement>(null);

  useEffect(() => setOpen(null), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <nav ref={root} aria-label="Разделы" className="flex items-center gap-0.5">
      {NAV_ITEMS.map((item) => (
        <div key={item.key} className="relative">
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={open === item.key}
            aria-current={active === item.key ? 'page' : undefined}
            onClick={() => setOpen(open === item.key ? null : item.key)}
            className={cn(
              'inline-flex h-9 items-center gap-1 rounded-lg px-3 text-[15px] transition-colors',
              active === item.key
                ? 'bg-[var(--accent-soft)] font-medium text-[var(--accent)]'
                : 'text-[var(--text)] hover:bg-[var(--surface-sunken)]',
            )}
          >
            {item.label}
            <ChevronDown
              size={14}
              className={cn('text-[var(--text-muted)] transition-transform', open === item.key && 'rotate-180')}
            />
          </button>
          {open === item.key && <Dropdown item={item} pathname={pathname} />}
        </div>
      ))}
    </nav>
  );
}

function Dropdown({ item, pathname }: { item: NavItem; pathname: string }) {
  const children = useChildren(item);
  const here = `${pathname}${window.location.search}`;

  return (
    <div
      role="menu"
      className="absolute left-0 top-full z-30 mt-1 min-w-56 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-1.5 shadow-[var(--shadow-subtle)]"
    >
      {children.map((c) => (
        <Link
          key={c.to}
          role="menuitem"
          to={c.to}
          className={cn(
            'block rounded-lg px-2.5 py-2 text-[15px] transition-colors',
            here === c.to
              ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
              : 'text-[var(--text)] hover:bg-[var(--surface-sunken)]',
          )}
        >
          {c.label}
        </Link>
      ))}
    </div>
  );
}

/**
 * Подстраницы пункта. У «Документов» к постоянным добавляются папки
 * человека — они не в списке, потому что их заводит он сам.
 */
function useChildren(item: NavItem): NavChild[] {
  const folders = useFolders();
  if (item.key !== 'documents') return item.children;
  const own = (folders.data ?? []).map((f) => ({
    to: `/documents?folder=${f.id}`,
    label: f.name,
  }));
  return [...item.children, ...own];
}
