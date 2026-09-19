import { Link, useLocation } from 'react-router-dom';
import {
  House,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '../ui/cn';
import { HelpMenu } from './HelpMenu';
import { NAV_ITEMS, activeNav } from './nav';

/**
 * Колонка разделов слева — на каждом экране кабинета.
 *
 * Сверху «Главная» и пять работ, снизу служебное, которым пользуются
 * реже. Подписи с иконками: по одной иконке раздел не узнать, по одной
 * подписи — не найти глазом среди строк. В рейке остаются иконки,
 * а подпись уходит в подсказку.
 *
 * «Главная» — не пункт `NAV_ITEMS`: те — работы, а главная — стол,
 * с которого к ним идут. Она подсвечивается сама по адресу.
 */
export function SideNav({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const { pathname } = useLocation();
  const active = activeNav(pathname);

  /*
   * Ширина меняется скачком, без анимации: анимированная ширина
   * перевёрстывала на каждом кадре всё, что справа, — реестр на
   * полсотни строк и холст редактора, — и сворачивание «зависало».
   * Ширина задана классом здесь, а не переменной на корне страницы:
   * смена переменной на предке пересчитывала стили всему дереву.
   */
  return (
    <aside
      className={cn(
        'hidden shrink-0 border-r border-[var(--line)] bg-[var(--surface)] md:block print:hidden',
        collapsed ? 'w-16' : 'w-60',
      )}
    >
      {/* Липнет под шапку тем же приёмом, что колонки внутри разделов:
          сама колонка растянута на всю строку, а на месте стоит её
          содержимое — иначе при прокрутке она уехала бы вверх. */}
      <div className="sticky top-[var(--app-header)] flex h-[calc(100dvh-var(--app-header))] flex-col overflow-y-auto p-2">
        <nav aria-label="Разделы" className="flex flex-col gap-0.5">
          <Item
            to="/"
            label="Главная"
            icon={House}
            active={pathname === '/'}
            collapsed={collapsed}
          />
          {NAV_ITEMS.map((item) => (
            <Item
              key={item.key}
              to={item.to}
              label={item.label}
              icon={item.icon}
              active={active === item.key}
              collapsed={collapsed}
            />
          ))}
        </nav>

        <div className="mt-auto flex flex-col gap-0.5 border-t border-[var(--line)] pt-2">
          <Item
            to="/settings"
            label="Настройки"
            icon={Settings}
            active={pathname.startsWith('/settings')}
            collapsed={collapsed}
          />
          <HelpMenu collapsed={collapsed} />
          <button
            type="button"
            onClick={onToggle}
            aria-label={collapsed ? 'Развернуть разделы' : 'Свернуть разделы'}
            className={cn(
              'flex h-11 items-center gap-3 rounded-xl text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text)]',
              collapsed ? 'justify-center' : 'px-3',
            )}
          >
            {collapsed ? (
              <PanelLeftOpen size={20} strokeWidth={1.75} />
            ) : (
              <PanelLeftClose size={20} strokeWidth={1.75} />
            )}
            {!collapsed && <span className="text-sm">Свернуть</span>}
          </button>
        </div>
      </div>
    </aside>
  );
}

function Item({
  to,
  label,
  icon: Icon,
  active,
  collapsed,
}: {
  to: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  collapsed: boolean;
}) {
  return (
    <Link
      to={to}
      aria-current={active ? 'page' : undefined}
      title={collapsed ? label : undefined}
      className={cn(
        'flex h-11 items-center gap-3 rounded-xl text-base transition-colors',
        collapsed ? 'justify-center' : 'px-3',
        active
          ? 'bg-[var(--accent-soft)] font-medium text-[var(--accent)]'
          : 'text-[var(--text)] hover:bg-[var(--surface-sunken)]',
      )}
    >
      <Icon size={20} strokeWidth={1.75} className="shrink-0" />
      {!collapsed && <span className="truncate">{label}</span>}
    </Link>
  );
}
