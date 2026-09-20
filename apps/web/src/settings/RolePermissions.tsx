import { Check, Minus } from 'lucide-react';
import { useRoles } from '../api/team';
import { SettingsSection } from '../ui/Settings';
import { TBody, THead, Table, Td, Th, Tr } from '../ui/Table';

/**
 * Что может каждая роль.
 *
 * Раньше роль выбирали по названию: «Управляющий» звучит солиднее
 * «Сотрудника», а чем они отличаются — знал только код сервера. Таблица
 * приходит оттуда же, где права и проверяются, чтобы кабинет не
 * пересказывал их своими словами и не расходился с действительностью.
 */
export function RolePermissions() {
  const { data } = useRoles();
  if (!data) return null;

  return (
    <SettingsSection
      title="Что может каждая роль"
      about="Владелец один, он же распоряжается оплатой. Управляющий делает всё то же, кроме денег."
    >
      <Table caption="Права ролей" stickyHeader={false} dense>
        <THead>
          <Tr>
            <Th />
            {data.roles.map((r) => (
              <Th key={r.role} align="center">
                {r.title}
              </Th>
            ))}
          </Tr>
        </THead>
        <TBody>
          {data.permissions.map((p) => (
            <Tr key={p.key}>
              <Td>{p.title}</Td>
              {data.roles.map((r) => (
                <Td key={r.role} align="center">
                  {p.roles[r.role] ? (
                    <Check size={16} className="mx-auto text-ok" aria-label="да" />
                  ) : (
                    <Minus size={16} className="mx-auto text-line-strong" aria-label="нет" />
                  )}
                </Td>
              ))}
            </Tr>
          ))}
        </TBody>
      </Table>
    </SettingsSection>
  );
}
