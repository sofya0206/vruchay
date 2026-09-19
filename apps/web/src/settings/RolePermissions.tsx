import { Check, Minus } from 'lucide-react';
import { useRoles } from '../api/team';

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
    <div className="mt-8">
      <h3 className="font-medium">Права ролей</h3>
      <p className="mt-1 max-w-2xl text-sm text-[var(--text-muted)] max-md:hidden">
        Владелец у организации один — он же распоряжается оплатой. Управляющий делает всё то же,
        кроме денег и передачи организации.
      </p>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-96 border-collapse text-sm">
          <thead>
            <tr className="border-b border-[var(--line)] text-left">
              <th className="py-2 pr-4 font-medium">Что можно</th>
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
                <td className="py-2 pr-4">{p.title}</td>
                {data.roles.map((r) => (
                  <td key={r.role} className="px-3 py-2 text-center">
                    {p.roles[r.role] ? (
                      <Check size={16} className="mx-auto text-[var(--accent)]" aria-label="да" />
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
    </div>
  );
}
