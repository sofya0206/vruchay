import { NavLink, Outlet } from 'react-router-dom';
import { SETTINGS_SECTIONS } from '../settings/sections';

/**
 * Оболочка настроек: меню слева, раздел справа.
 *
 * У каждого раздела свой адрес, поэтому ссылку на нужное место можно
 * дать коллеге, а браузер помнит, где человек был. На узком экране меню
 * превращается в ленту сверху — на телефоне колонка съела бы весь экран.
 *
 * Своей шапки нет: страница стоит под общей полосой кабинета, и вторая
 * строка с «назад» над колонкой разделов только отнимала бы высоту.
 */
export function SettingsPage() {
  return (
    <div className="min-h-full">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-8 md:flex-row">
        <nav aria-label="Разделы настроек" className="md:w-56 md:shrink-0">
          <ul className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
            {SETTINGS_SECTIONS.map((s) => (
              <li key={s.path}>
                <NavLink
                  to={`/settings/${s.path}`}
                  className={({ isActive }) =>
                    `flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm transition ${
                      isActive
                        ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
                        : 'text-[var(--text-muted)] hover:bg-[var(--surface)] hover:text-[var(--text)]'
                    }`
                  }
                >
                  <s.icon size={16} />
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
