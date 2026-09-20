import { LogOut, Receipt } from 'lucide-react';
import { useLogout, useMe } from '../auth/useAuth';
import { Avatar } from '../ui/Avatar';
import { Menu, MenuDivider, MenuItem, MenuLabel } from '../ui/Menu';
import { useTooltip } from '../ui/Tooltip';
import { cn } from '../ui/cn';

/**
 * Учётная запись: строка внизу колонки разделов на широком экране,
 * кружок в верхней полосе на телефоне.
 *
 * Внутри только то, чего нет в колонке разделов: кто вошёл, счета
 * платформы и выход. Настройки и справка стоят в колонке — второй раз
 * их здесь не называем.
 */
export function AccountMenu({
  variant = 'avatar',
  collapsed = false,
}: {
  variant?: 'avatar' | 'row';
  collapsed?: boolean;
}) {
  const me = useMe();
  const logout = useLogout();

  const person = me.data?.name?.trim() || me.data?.email || '';
  const compact = variant === 'avatar' || collapsed;
  /* На кружке видна одна буква — чьё это имя, говорит подсказка. */
  const tip = useTooltip(compact ? person : undefined, {
    describes: true,
    placement: variant === 'row' ? 'right' : 'bottom',
  });

  return (
    <Menu
      side={variant === 'row' ? 'top' : 'bottom'}
      align={variant === 'row' ? 'left' : 'right'}
      title="Учётная запись"
      trigger={({ open, toggle }) => (
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="Учётная запись"
          {...tip.triggerProps}
          onClick={toggle}
          className={cn(
            'pressable flex items-center gap-2.5 rounded-control text-sm transition-colors hover:bg-sunken',
            variant === 'avatar' && 'size-10 justify-center rounded-full',
            variant === 'row' && (collapsed ? 'h-10 w-full justify-center' : 'h-10 w-full px-2 text-left'),
            open && 'bg-sunken',
          )}
        >
          <Avatar name={me.data?.name} email={me.data?.email} size={variant === 'avatar' ? 'md' : 'sm'} />
          {variant === 'row' && !collapsed && (
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-ink">{person || '·'}</span>
              {me.data?.name?.trim() && me.data.email && (
                <span className="block truncate text-xs text-muted">{me.data.email}</span>
              )}
            </span>
          )}
          {tip.tooltip}
        </button>
      )}
    >
      <MenuLabel>
        {me.data?.name?.trim() && <span className="block text-ink">{me.data.name}</span>}
        {me.data?.email}
      </MenuLabel>

      {me.data?.isPlatform && (
        <MenuItem to="/invoices" icon={<Receipt size={16} strokeWidth={1.75} />}>
          Счета и заявки
        </MenuItem>
      )}

      <MenuDivider />

      <MenuItem onClick={() => logout.mutate()} icon={<LogOut size={16} strokeWidth={1.75} />} className="text-muted">
        Выйти
      </MenuItem>
    </Menu>
  );
}
