import { Link, useLocation } from 'react-router-dom';
import { House, PanelLeftClose, PanelLeftOpen, Settings, type LucideIcon } from 'lucide-react';
import { useTooltip } from '../ui/Tooltip';
import { cn } from '../ui/cn';
import { AccountMenu } from './AccountMenu';
import { Brand } from './Brand';
import { HelpMenu } from './HelpMenu';
import { NAV_ITEMS, activeNav } from './nav';

/**
 * Колонка разделов слева — на каждом экране кабинета, на широком экране
 * она же и вся рама: знак наверху, три работы, внизу настройки, помощь
 * и учётная запись. Верхней полосы на широком экране нет — она съедала
 * строку на каждом экране ради двух кнопок.
 *
 * Подписи с иконками: по одной иконке раздел не узнать, по одной подписи —
 * не найти глазом среди строк. В рейке остаются иконки, подпись уходит
 * в подсказку.
 */
export function SideNav({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const { pathname } = useLocation();
  const active = activeNav(pathname);

  /*
   * Ширина меняется скачком, без анимации: анимированная ширина
   * перевёрстывала на каждом кадре всё, что справа, — реестр на
   * полсотни строк и холст редактора, — и сворачивание «зависало».
   */
  return (
    <aside
      className={cn(
        'hidden shrink-0 border-r border-line bg-surface md:block print:hidden',
        collapsed ? 'w-16' : 'w-60',
      )}
    >
      <div className="sticky top-0 flex h-dvh flex-col overflow-y-auto p-2">
        <Link
          to="/"
          aria-label="На главную"
          className={cn(
            'pressable mb-2 flex h-12 items-center gap-2.5 rounded-card hover:bg-sunken',
            collapsed ? 'justify-center' : 'px-2',
          )}
        >
          <Brand size={28} />
          {!collapsed && <span className="text-lg font-medium">Вручай</span>}
        </Link>

        <nav aria-label="Разделы" data-tour="nav" className="flex flex-col gap-0.5">
          <Item to="/" label="Главная" icon={House} active={pathname === '/'} collapsed={collapsed} />
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

        <div className="mt-auto flex flex-col gap-0.5 border-t border-line pt-2">
          <Item
            to="/settings"
            label="Настройки"
            icon={Settings}
            active={pathname.startsWith('/settings')}
            collapsed={collapsed}
          />
          <HelpMenu collapsed={collapsed} />
          <AccountMenu variant="row" collapsed={collapsed} />
          <button
            type="button"
            onClick={onToggle}
            aria-label={collapsed ? 'Развернуть разделы' : 'Свернуть разделы'}
            className={cn(
              'pressable flex h-10 items-center gap-3 rounded-control text-sm text-muted hover:bg-sunken hover:text-ink',
              collapsed ? 'justify-center' : 'px-2.5',
            )}
          >
            {collapsed ? <PanelLeftOpen size={20} strokeWidth={1.75} /> : <PanelLeftClose size={20} strokeWidth={1.75} />}
            {!collapsed && <span>Свернуть</span>}
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
  const tip = useTooltip(collapsed ? label : undefined, { placement: 'right' });
  return (
    <Link
      to={to}
      aria-current={active ? 'page' : undefined}
      aria-label={collapsed ? label : undefined}
      {...tip.triggerProps}
      className={cn(
        'pressable flex h-10 items-center gap-3 rounded-control text-sm transition-colors',
        collapsed ? 'justify-center' : 'px-2.5',
        active ? 'bg-accent-soft font-medium text-accent' : 'text-ink hover:bg-sunken',
      )}
    >
      <Icon size={20} strokeWidth={1.75} className="shrink-0" />
      {!collapsed && <span className="truncate">{label}</span>}
      {tip.tooltip}
    </Link>
  );
}
