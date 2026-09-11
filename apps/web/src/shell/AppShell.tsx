import { useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronDown, ChevronUp } from 'lucide-react';
import { InstallHint } from '../ui/InstallHint';
import { AccountMenu } from './AccountMenu';
import { BurgerMenu } from './BurgerMenu';
import { TopNav } from './TopNav';

/** Спрятана ли полоса. Выбор человека, поэтому переживает перезагрузку. */
const HIDDEN_KEY = 'nav:hidden';

function readHidden(): boolean {
  try {
    return localStorage.getItem(HIDDEN_KEY) === '1';
  } catch {
    // Приватное окно или запрет на хранение — тогда полоса просто видна.
    return false;
  }
}

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
 * раньше: высота идёт от окна, а не от содержимого. А кому и этих
 * пятидесяти пикселей жалко — полосу можно убрать совсем.
 */
export function AppShell() {
  const [hidden, setHidden] = useState(readHidden);
  const { pathname } = useLocation();
  const navigate = useNavigate();

  function toggle(next: boolean) {
    setHidden(next);
    try {
      localStorage.setItem(HIDDEN_KEY, next ? '1' : '0');
    } catch {
      // Не сохранилось — не беда: на этой вкладке полоса всё равно
      // послушалась, а в следующий раз вернётся видимой.
    }
  }

  const icon =
    'grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text)]';

  return (
    <div className="flex h-full flex-col">
      {hidden ? (
        /* Спрятанная полоса оставляет по себе полоску в шесть пикселей
           содержимого: без неё вернуть меню было бы нечем, а человек,
           нажавший случайно, оказался бы в кабинете без выхода. */
        <div className="z-20 flex h-6 shrink-0 items-center justify-end border-b border-[var(--line)] bg-[var(--surface)] px-3">
          <button
            type="button"
            onClick={() => toggle(false)}
            title="Показать меню"
            aria-label="Показать меню"
            className="grid h-5 w-8 place-items-center rounded text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text)]"
          >
            <ChevronDown size={14} />
          </button>
        </div>
      ) : (
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
                className={icon}
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

            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                onClick={() => toggle(true)}
                title="Скрыть меню"
                aria-label="Скрыть меню"
                className={`${icon} hidden sm:grid`}
              >
                <ChevronUp size={17} />
              </button>
              <AccountMenu />
            </div>
          </div>
        </header>
      )}

      {/* Прокрутка — здесь, а не у окна: полоса стоит на месте, а редактор,
          которому нужна вся высота, получает её через h-full. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <Outlet />
      </div>

      <InstallHint />
    </div>
  );
}
