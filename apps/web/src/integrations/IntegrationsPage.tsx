import { NavLink, Outlet } from 'react-router-dom';
import { INTEGRATION_SECTIONS } from './sections';

/**
 * Оболочка раздела: список площадок слева, выбранная — справа.
 *
 * У каждой площадки свой адрес, поэтому ссылку на настройку Тильды можно
 * дать коллеге, а браузер помнит, где человек был. На узком экране список
 * превращается в ленту сверху — колонка съела бы весь экран телефона.
 *
 * Рамка — во всю ширину окна, как в «Награждении» и «Письмах»: колонка
 * площадок прижата к левому краю и приклеена под шапкой, настройки идут
 * сразу за ней. До этого раздел жил колонкой 1024 точки по центру экрана
 * и на рабочем мониторе выглядел запиской посреди пустого стола — мелкой
 * и ничьей.
 */
export function IntegrationsPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      <aside className="border-b border-[var(--line)] md:w-72 md:shrink-0 md:border-r md:border-b-0">
        {/* --app-header — высота шапки кабинета вместе с её линией: колонка
            встаёт ровно под шапку и дальше стоит на месте, пока настройки
            прокручиваются. */}
        <nav
          aria-label="Площадки"
          className="p-3 md:sticky md:top-[var(--app-header)] md:max-h-[calc(100vh-var(--app-header))] md:overflow-y-auto"
        >
          <ul className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
            {INTEGRATION_SECTIONS.map((s) => (
              <li key={s.path}>
                <NavLink
                  to={`/integrations/${s.path}`}
                  className={({ isActive }) =>
                    `flex items-center gap-3 whitespace-nowrap rounded-lg px-3 py-2.5 transition ${
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
      </aside>

      {/* Настройки не растягиваем во всю оставшуюся ширину: строка ввода
          в полтора экрана не читается, глаз теряет начало строки по пути
          к концу. Предел — 72rem, вдвое шире прежней колонки, и прижат
          влево, а не поставлен по центру. */}
      <main className="min-w-0 flex-1 px-6 py-7 md:px-8">
        <div className="max-w-6xl">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
