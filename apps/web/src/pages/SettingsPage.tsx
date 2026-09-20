import { Outlet, useLocation } from 'react-router-dom';
import { SETTINGS_GROUPS, SETTINGS_SECTIONS } from '../settings/sections';
import { PageHeader } from '../ui/PageHeader';
import { ColumnList, ColumnRow, SectionLayout } from '../ui/SectionLayout';

/**
 * Настройки: та же рама, что у документов, — колонка разделов слева,
 * название открытого раздела в панели сверху.
 *
 * Колонка разбита на две группы по владельцу настройки: что моё и что
 * общее для организации.
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
              <p className="mb-1 px-3 text-xs font-medium tracking-wide text-muted uppercase md:px-2">{group.title}</p>
              <ColumnList>
                {SETTINGS_SECTIONS.filter((s) => s.group === group.key).map((s) => (
                  <ColumnRow key={s.path} to={`/settings/${s.path}`} icon={s.icon} active={current?.path === s.path}>
                    {s.title}
                  </ColumnRow>
                ))}
              </ColumnList>
            </div>
          ))}
        </nav>
      }
      head={<PageHeader title={current?.title ?? 'Настройки'} />}
    >
      {/* Колонка читается в ~70 знаков, поэтому она узкая; по центру, а не
          у левого края — иначе на широком окне справа остаётся пустая
          полоса шире самой колонки. */}
      <div className="mx-auto max-w-3xl">
        <Outlet />
      </div>
    </SectionLayout>
  );
}
