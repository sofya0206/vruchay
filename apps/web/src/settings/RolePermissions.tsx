import { Check, Minus } from 'lucide-react';
import { useRoles } from '../api/team';
import { SettingsSection } from '../ui/Settings';

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
      <div className="overflow-x-auto">
        <table className="w-full min-w-96 border-collapse text-sm">
          <thead>
            <tr className="border-b border-[var(--line)] text-left text-xs tracking-wide text-[var(--text-muted)] uppercase">
              <th className="py-2 pr-4 font-medium" />
              {data.roles.map((r) => (
                <th key={r.role} className="px-3 py-2 text-center font-medium">
                  {r.title}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.permissions.map((p) => (
              <tr key={p.key} className="border-b border-[var(--line)] last:border-0">
                <td className="py-2.5 pr-4">{p.title}</td>
                {data.roles.map((r) => (
                  <td key={r.role} className="px-3 py-2.5 text-center">
                    {p.roles[r.role] ? (
                      <Check size={16} className="mx-auto text-[var(--ok)]" aria-label="да" />
                    ) : (
                      <Minus
                        size={16}
                        className="mx-auto text-[var(--line-strong)]"
                        aria-label="нет"
                      />
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SettingsSection>
  );
}
