import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { InstallHint } from '../ui/InstallHint';
import { AccountMenu } from './AccountMenu';
import { BurgerMenu } from './BurgerMenu';
import { TopNav } from './TopNav';

/**
 * Оболочка кабинета: полоса разделов сверху — на каждом экране.
 *
 * Слева возврат назад, знак и пять разделов, справа — учётная запись,
 * под которой лежит служебное. Слово «Главная» ушло: по нему не было
 * видно, что за ним меню, — теперь меню и есть полоса, а на главную
 * ведёт знак, как везде.
 *
 * Редактор материала и рабочее место письма живут под этой же полосой:
 * именно там человек терялся — «зашёл в редактор, а к письмам только
 * назад». Полоса тонкая, и лист ниже неё получает ту же высоту, что
 * раньше: высота идёт от окна, а не от содержимого.
 */
export function AppShell() {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  return (
    <div className="flex h-full flex-col">
      <header className="z-20 shrink-0 border-b border-[var(--line)] bg-[var(--surface)]">
        <div className="flex h-13 items-center gap-2 px-3 sm:px-4">
          {/* Бургер — только на узком экране, где полосы нет. */}
          <BurgerMenu />

          {/* Назад — шаг по своим следам, а не «вверх по разделам»:
              из письма человек уходил в реестр и хочет вернуться
              в письмо, а не в список материалов. На главной прятать:
              оттуда назад — уже наружу кабинета. */}
          {pathname !== '/' && (
            <button
              type="button"
              onClick={() => navigate(-1)}
              title="Назад"
              aria-label="Назад"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text)]"
            >
              <ArrowLeft size={19} />
            </button>
          )}

          <Link
            to="/"
            aria-label="На главную"
            className="mr-2 inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-[17px] font-medium transition-colors hover:bg-[var(--surface-sunken)]"
          >
            <span aria-hidden className="h-[18px] w-[18px] rounded-full bg-[var(--accent)]" />
            Вручай
          </Link>

          {/* Полоса скрыта на узком экране: пять подписей туда не входят. */}
          <div className="hidden md:block">
            <TopNav />
          </div>

          <div className="ml-auto">
            <AccountMenu />
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
