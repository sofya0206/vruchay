import { NavLink, Outlet } from 'react-router-dom';
import { INTEGRATION_SECTIONS } from './sections';

/**
 * Оболочка раздела: список площадок слева, выбранная — справа.
 *
 * У каждой площадки свой адрес, поэтому ссылку на настройку Тильды можно
 * дать коллеге, а браузер помнит, где человек был. На узком экране список
 * превращается в ленту сверху — колонка съела бы весь экран телефона.
 */
export function IntegrationsPage() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="flex flex-col gap-8 md:flex-row">
        <nav aria-label="Площадки" className="md:w-56 md:shrink-0">
          <ul className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
            {INTEGRATION_SECTIONS.map((s) => (
              <li key={s.path}>
                <NavLink
                  to={`/integrations/${s.path}`}
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm transition ${
                      isActive
                        ? 'bg-[var(--accent-soft)] font-medium text-[var(--text)]'
                        : 'text-[var(--text-muted)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text)]'
                    }`
                  }
                >
                  {s.icon}
                  {s.title}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
