import { LogOut, Receipt } from 'lucide-react';
import { useLogout, useMe } from '../auth/useAuth';
import { Menu, MenuDivider, MenuItem, MenuLabel } from '../ui/Menu';
import { useTooltip } from '../ui/Tooltip';

/**
 * Учётная запись — кружок справа в шапке.
 *
 * Внутри только то, чего нет в колонке разделов: кто вошёл, счета
 * платформы и выход. Настройки и справка стоят в колонке — второй раз
 * их здесь не называем.
 */
export function AccountMenu() {
  const me = useMe();
  const logout = useLogout();

  const person = me.data?.name?.trim() || me.data?.email || '';

  /* На кружке видна одна буква — чьё это имя, говорит подсказка. */
  const tip = useTooltip(person, { describes: true, placement: 'bottom' });

  return (
    <Menu
      trigger={({ open, toggle }) => (
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="Учётная запись"
          {...tip.triggerProps}
          onClick={toggle}
          className="grid h-11 w-11 place-items-center rounded-full bg-[var(--surface-sunken)] text-base font-medium text-[var(--text-muted)] transition-colors hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]"
        >
          {person.slice(0, 1).toUpperCase() || '·'}
          {tip.tooltip}
        </button>
      )}
    >
      <MenuLabel>
        {me.data?.name?.trim() && <span className="block text-[var(--text)]">{me.data.name}</span>}
        {me.data?.email}
      </MenuLabel>

      {me.data?.isPlatform && (
        <MenuItem to="/invoices" icon={<Receipt size={17} strokeWidth={1.75} />}>
          Счета и заявки
        </MenuItem>
      )}

      <MenuDivider />

      <MenuItem
        onClick={() => logout.mutate()}
        icon={<LogOut size={17} strokeWidth={1.75} />}
        className="text-[var(--text-muted)]"
      >
        Выйти
      </MenuItem>
    </Menu>
  );
}
