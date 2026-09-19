import { Outlet, useLocation } from 'react-router-dom';
import { SETTINGS_SECTIONS } from '../settings/sections';
import { ColumnList, ColumnRow, SectionLayout, SectionTitle } from '../ui/SectionLayout';

/**
 * Настройки: та же рама, что у документов и писем, — колонка разделов
 * слева, название открытого раздела в панели сверху.
 *
 * У каждого раздела свой адрес, поэтому ссылку на нужное место можно
 * дать коллеге, а браузер помнит, где человек был.
 */
export function SettingsPage() {
  const { pathname } = useLocation();
  const current = SETTINGS_SECTIONS.find((s) => pathname.startsWith(`/settings/${s.path}`));

  return (
    <SectionLayout
      columnTitle="Настройки"
      column={
        <nav aria-label="Разделы настроек">
          <ColumnList>
            {SETTINGS_SECTIONS.map((s) => (
              <ColumnRow
                key={s.path}
                to={`/settings/${s.path}`}
                icon={s.icon}
                active={current?.path === s.path}
              >
                {s.title}
              </ColumnRow>
            ))}
          </ColumnList>
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
