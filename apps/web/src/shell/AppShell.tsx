import { Link, Outlet, useLocation } from 'react-router-dom';
import { InstallHint } from '../ui/InstallHint';
import { AccountMenu } from './AccountMenu';
import { BurgerMenu } from './BurgerMenu';
import { TopNav } from './TopNav';

/**
 * Оболочка кабинета: полоса разделов сверху — на каждом экране кабинета.
 *
 * Слева знак и пять разделов, справа — учётная запись, под которой
 * лежит служебное. Слово «Главная» ушло: по нему не было видно,
 * что за ним меню, — теперь меню и есть полоса, а на главную ведёт знак,
 * как везде. Отдельной стрелки «Назад» в разделах нет: полоса и знак и
 * есть дорога куда угодно, а стрелка рядом с ними была третьим способом
 * попасть туда же. Набрано в полный рост: знак 44 пункта, слово — 24,
 * высота из `--app-header` — под шапкой приклеены колонки разделов, и
 * они отсчитывают своё место от неё.
 *
 * Материал — лист, список, письмо — живёт без полосы: макету нужен весь
 * экран. Выход оттуда — стрелка в рамке материала, она ведёт в документы.
 */
export function AppShell() {
  const { pathname } = useLocation();
  // Материал — это /documents/<id> и /mailing/<id>. Архив живёт по
  // /documents/archive и материалом не является: у него, как у любого
  // раздела, должна быть полоса.
  const inMaterial = /^\/(documents|mailing)\/(?!archive(\/|$))[^/]+/.test(pathname);

  return (
    <div className="flex min-h-full flex-col">
      {!inMaterial && (
        <header className="sticky top-0 z-20 shrink-0 border-b border-[var(--line)] bg-[var(--surface)]">
          {/* Во всю ширину окна, а не колонкой по центру: шапка — рама экрана.
              Минус пиксель — нижняя линия, она входит в ту же высоту. */}
          <div className="flex h-[calc(var(--app-header)-1px)] items-center gap-3 px-3 sm:px-5">
            {/* Бургер — только на узком экране, где полосы нет. */}
            <BurgerMenu />

            <Link
              to="/"
              aria-label="На главную"
              className="-mx-2 inline-flex items-center gap-3 rounded-xl px-2 py-1.5 transition-colors hover:bg-[var(--surface-sunken)]"
            >
              <span
                aria-hidden
                className="inline-flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-[var(--accent)] ring-4 ring-[var(--accent-soft)]"
              >
                {/* Медаль залита, а не обведена: тот же знак, что на заставке. */}
                <svg width="26" height="26" viewBox="0 0 24 24" fill="#ffffff">
                  <circle cx="12" cy="9.5" r="4.3" />
                  <path d="M9.2 13.7 7.9 20.5 12 18.2l4.1 2.3-1.3-6.8L12 15.1Z" />
                </svg>
              </span>
              <span className="text-2xl font-medium">Вручай</span>
            </Link>

            {/* Полоса скрыта на узком экране: пять подписей туда не входят. */}
            <div className="ml-3 hidden md:block">
              <TopNav />
            </div>

            <div className="ml-auto">
              <AccountMenu />
            </div>
          </div>
        </header>
      )}

      {/* Высота обёртки — окно минус шапка: редактор (h-full) получает всё,
          что осталось, а страницы длиннее окна просто выступают наружу —
          прокручивает их окно, и липкие колонки разделов считают своё
          место от шапки. */}
      <div
        className={
          inMaterial
            ? 'flex h-dvh shrink-0 flex-col'
            : 'flex h-[calc(100dvh-var(--app-header))] shrink-0 flex-col'
        }
      >
        <Outlet />
      </div>

      <InstallHint />
    </div>
  );
}

