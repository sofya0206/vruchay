import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { SETTINGS_SECTIONS } from '../settings/sections';

/**
 * Оболочка настроек: меню слева, раздел справа.
 *
 * У каждого раздела свой адрес, поэтому ссылку на нужное место можно
 * дать коллеге, а браузер помнит, где человек был. На узком экране меню
 * превращается в ленту сверху — на телефоне колонка съела бы весь экран.
 */
export function SettingsPage() {
  const { pathname } = useLocation();
  const current = SETTINGS_SECTIONS.find((s) => pathname === `/settings/${s.path}`);

  return (
    <div className="min-h-full">
      <header className="border-b border-[var(--line)] bg-[var(--surface)]">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-6 py-3">
          <Link
            to="/documents"
            className="inline-flex items-center gap-2 text-sm text-[var(--text-muted)] hover:text-[var(--text)]"
          >
            <ArrowLeft size={16} />К материалам
          </Link>
          <span className="ml-auto font-serif text-lg">
            Настройки{current ? ` · ${current.title}` : ''}
          </span>
        </div>
      </header>

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
