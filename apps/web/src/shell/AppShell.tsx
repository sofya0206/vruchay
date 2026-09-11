import { Link, Outlet } from 'react-router-dom';
import { useMe } from '../auth/useAuth';
import { InstallHint } from '../ui/InstallHint';
import { BurgerMenu } from './BurgerMenu';
import { TopNav } from './TopNav';

/**
 * Оболочка кабинета: полоса разделов сверху — на каждом экране.
 *
 * Слева знак и пять пунктов с подстраницами, справа бургер с полным
 * деревом и учётная запись. Слово «Главная» ушло: по нему не было видно,
 * что за ним меню, — теперь меню и есть полоса, а на главную ведёт знак,
 * как везде. Escape больше не выбрасывает из раздела: раздел не диалог.
 *
 * Редактор материала и рабочее место письма живут под этой же полосой:
 * именно там человек терялся — «зашёл в редактор, а к письмам только
 * назад». Полоса тонкая, и лист ниже неё получает ту же высоту, что
 * раньше: высота идёт от окна, а не от содержимого.
 */
export function AppShell() {
  const me = useMe();
  const person = me.data?.name?.trim() || me.data?.email || '';

  return (
    <div className="flex h-full flex-col">
      <header className="z-20 shrink-0 border-b border-[var(--line)] bg-[var(--surface)]">
        <div className="flex h-11 items-center gap-3 px-3 sm:px-4">
          <Link
            to="/"
            aria-label="На главную"
            className="mr-1 inline-flex items-center gap-2 rounded-lg px-2 py-1 font-medium transition-colors hover:bg-[var(--surface-sunken)]"
          >
            <span aria-hidden className="h-4 w-4 rounded-full bg-[var(--accent)]" />
            Вручай
          </Link>

          {/* Полоса скрыта на узком экране: пять подписей туда не входят,
              и там меню — бургер. */}
          <div className="hidden md:block">
            <TopNav />
          </div>

          <div className="ml-auto flex items-center gap-1">
            <BurgerMenu />
            <Link
              to="/settings"
              title={person}
              aria-label="Учётная запись"
              className="grid h-8 w-8 place-items-center rounded-full bg-[var(--surface-sunken)] text-sm font-medium text-[var(--text-muted)] transition-colors hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]"
            >
              {person.slice(0, 1).toUpperCase() || '·'}
            </Link>
          </div>
        </div>
      </header>

      {/* Прокрутка — здесь, а не у окна: полоса стоит на месте, а редактор,
          которому нужна вся высота, получает её через h-full. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <Outlet />
      </div>

      <InstallHint />
    </div>
  );
}
