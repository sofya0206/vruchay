import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Award, LogOut, Receipt, Settings } from 'lucide-react';
import { useLogout, useMe } from '../auth/useAuth';
import { Button } from '../ui/Button';
import { InstallHint } from '../ui/InstallHint';
import { SECTIONS, activeSection } from './sections';

/**
 * Оболочка кабинета: шапка и разделы.
 *
 * Стоит маршрутом-родителем, а не блоком внутри каждой страницы. Так шапка
 * и навигация не перерисовываются при переходе между разделами — раньше
 * каждая страница рисовала свою шапку, и переход выглядел как перезагрузка.
 *
 * Редактор материала и настройки сюда не входят: у редактора вся высота
 * экрана занята листом, а настройки — отдельная страница со ссылкой назад.
 */
export function AppShell() {
  const me = useMe();
  const logout = useLogout();
  const { pathname } = useLocation();
  const active = activeSection(pathname);

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-20 border-b border-[var(--line)] bg-[var(--surface)]">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-6 py-3">
          <Link to="/" className="flex items-center gap-3" aria-label="Вручай, рабочий стол">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--accent)] text-[var(--accent-contrast)]">
              <Award size={17} strokeWidth={1.75} />
            </span>
            <span className="font-serif text-lg">Вручай</span>
          </Link>

          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-sm text-[var(--text-muted)] sm:inline">
              {me.data?.email}
            </span>
            {/* Счета и заявки — наша собственная бухгалтерия. Клиенту эта
                ссылка вела в раздел, где его встречал отказ, поэтому
                показываем её только своим. */}
            {me.data?.isPlatform && (
              <Link
                to="/invoices"
                title="Счета и заявки"
                aria-label="Счета и заявки"
                className="inline-flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text)]"
              >
                <Receipt size={15} />
                <span className="hidden sm:inline">Счета</span>
              </Link>
            )}
            {/* aria-label обязателен: на узком экране подпись скрыта,
                и без него остаётся ссылка вообще без названия — и для
                чтения с экрана, и для всплывающей подсказки. */}
            <Link
              to="/settings"
              title="Настройки"
              aria-label="Настройки"
              className="inline-flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text)]"
            >
              <Settings size={15} />
              <span className="hidden sm:inline">Настройки</span>
            </Link>
            <Button
              size="sm"
              variant="ghost"
              icon={<LogOut size={15} />}
              onClick={() => logout.mutate()}
            >
              <span className="hidden sm:inline">Выйти</span>
            </Button>
          </div>
        </div>

        {/* Разделы прокручиваются вбок, а не сжимаются и не прячутся
            в меню: на телефоне все шесть подписей всё равно не помещаются,
            а спрятанная навигация на рабочем экране — лишнее нажатие
            перед каждым переходом. */}
        <nav
          aria-label="Разделы кабинета"
          className="mx-auto max-w-5xl overflow-x-auto px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <ul className="flex min-w-max gap-1">
            {SECTIONS.map((section) => (
              <li key={section.path}>
                <NavLink
                  to={section.path}
                  aria-current={active === section.path ? 'page' : undefined}
                  className={`-mb-px flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm transition-colors ${
                    active === section.path
                      ? 'border-[var(--accent)] font-medium text-[var(--text)]'
                      : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
                  }`}
                >
                  <section.icon size={15} strokeWidth={1.75} />
                  {section.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <div className="flex-1">
        <Outlet />
      </div>

      <InstallHint />
    </div>
  );
}
