import { Outlet, useLocation } from 'react-router-dom';
import { Plug } from 'lucide-react';
import { SETTINGS_GROUPS, SETTINGS_SECTIONS } from '../settings/sections';
import { ColumnList, ColumnRow, SectionLayout, SectionTitle } from '../ui/SectionLayout';

/**
 * Настройки: та же рама, что у документов и писем, — колонка разделов
 * слева, название открытого раздела в панели сверху.
 *
 * Колонка разбита на три группы по владельцу настройки. Раньше десять
 * пунктов стояли одним столбиком, и «Домены» соседствовали с «Паролем»:
 * что из этого моё, а что общее, приходилось помнить.
 */
export function SettingsPage() {
  const { pathname } = useLocation();
  const current = SETTINGS_SECTIONS.find((s) => pathname.startsWith(`/settings/${s.path}`));

  return (
    <SectionLayout
      columnTitle="Настройки"
      column={
        <nav aria-label="Разделы настроек" className="flex flex-col gap-4">
          {SETTINGS_GROUPS.map((group) => (
            <div key={group.key}>
              <p className="mb-1 px-3 text-xs font-medium tracking-wide text-[var(--text-muted)] uppercase md:px-2">
                {group.title}
              </p>
              <ColumnList>
                {SETTINGS_SECTIONS.filter((s) => s.group === group.key).map((s) => (
                  <ColumnRow
                    key={s.path}
                    to={`/settings/${s.path}`}
                    icon={s.icon}
                    active={current?.path === s.path}
                  >
                    {s.title}
                  </ColumnRow>
                ))}
                {group.key === 'dev' && (
                  <ColumnRow to="/integrations" icon={Plug} active={false}>
                    Интеграции
                  </ColumnRow>
                )}
              </ColumnList>
            </div>
          ))}
        </nav>
      }
      head={<SectionTitle>{current?.title ?? 'Настройки'}</SectionTitle>}
    >
      <div className="max-w-3xl">
        <Outlet />
      </div>
    </SectionLayout>
  );
}
