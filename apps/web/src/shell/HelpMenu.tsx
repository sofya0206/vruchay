import { useLocation } from 'react-router-dom';
import { CircleHelp } from 'lucide-react';
import { Menu, MenuDivider, MenuItem } from '../ui/Menu';
import { useTooltip } from '../ui/Tooltip';
import { cn } from '../ui/cn';
import { HELP_PATHS, helpItems } from './help-items';

/**
 * «Помощь» — одно меню на кабинет.
 *
 * Внизу колонки разделов строкой, в верхней полосе телефона значком «?».
 * Первый пункт — подсказки по открытому экрану, если у экрана они есть;
 * дальше обучение, база знаний, поддержка. Список один (help-items.ts),
 * поэтому бургер на телефоне показывает то же самое.
 */
export function HelpMenu({
  variant = 'row',
  collapsed = false,
}: {
  variant?: 'row' | 'icon';
  collapsed?: boolean;
}) {
  const { pathname, search } = useLocation();
  const active = HELP_PATHS.some((p) => pathname.startsWith(p));
  const compact = variant === 'icon' || collapsed;
  const tip = useTooltip(compact ? 'Помощь' : undefined, { placement: variant === 'icon' ? 'bottom' : 'right' });
  const items = helpItems(pathname, search);

  return (
    <Menu
      side={variant === 'row' ? 'top' : 'bottom'}
      align={variant === 'row' ? 'left' : 'right'}
      title="Помощь"
      trigger={({ open, toggle }) => (
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={compact ? 'Помощь' : undefined}
          {...tip.triggerProps}
          onClick={toggle}
          className={cn(
            'pressable flex h-10 items-center gap-3 rounded-control text-sm transition-colors',
            variant === 'icon' ? 'w-10 justify-center' : collapsed ? 'w-full justify-center' : 'w-full px-2.5',
            active || open ? 'bg-accent-soft font-medium text-accent' : 'text-ink hover:bg-sunken',
          )}
        >
          <CircleHelp size={20} strokeWidth={1.75} className="shrink-0" />
          {!compact && <span className="truncate">Помощь</span>}
          {tip.tooltip}
        </button>
      )}
    >
      {items.map((item, i) =>
        item.kind === 'divider' ? (
          <MenuDivider key={i} />
        ) : item.kind === 'link' ? (
          <MenuItem key={item.to} to={item.to} icon={<item.icon size={16} strokeWidth={1.75} />}>
            {item.label}
          </MenuItem>
        ) : (
          <MenuItem key={item.label} onClick={item.run} icon={<item.icon size={16} strokeWidth={1.75} />}>
            {item.label}
          </MenuItem>
        ),
      )}
    </Menu>
  );
}
