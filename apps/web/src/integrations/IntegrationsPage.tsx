import { Outlet, useLocation } from 'react-router-dom';
import { INTEGRATION_SECTIONS } from './sections';
import { ColumnList, ColumnRow, SectionLayout, SectionTitle } from '../ui/SectionLayout';

/**
 * Интеграции: та же рама, что у документов и писем, — площадки слева,
 * выбранная — справа. У каждой площадки свой адрес, поэтому ссылку
 * на настройку Тильды можно дать коллеге.
 */
export function IntegrationsPage() {
  const { pathname } = useLocation();
  const current = INTEGRATION_SECTIONS.find((s) => pathname.startsWith(`/integrations/${s.path}`));

  return (
    <SectionLayout
      column={
        <nav aria-label="Площадки">
          <ColumnList>
            {INTEGRATION_SECTIONS.map((s) => (
              <ColumnRow
                key={s.path}
                to={`/integrations/${s.path}`}
                icon={s.icon}
                active={current?.path === s.path}
              >
                {s.title}
              </ColumnRow>
            ))}
          </ColumnList>
        </nav>
      }
      head={<SectionTitle>{current?.title ?? 'Интеграции'}</SectionTitle>}
    >
      {/* Настройки не растягиваем во всю ширину: строка ввода в полтора
          экрана не читается. */}
      <div className="max-w-4xl">
        <Outlet />
      </div>
    </SectionLayout>
  );
}
