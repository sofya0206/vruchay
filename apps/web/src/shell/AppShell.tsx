import { useEffect } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { InstallHint } from '../ui/InstallHint';
import { AccountMenu } from './AccountMenu';
import { BurgerMenu } from './BurgerMenu';
import { TopNav } from './TopNav';

/**
 * Оболочка кабинета: полоса разделов сверху — на каждом экране.
 *
 * Слева знак и пять разделов, справа — учётная запись, под которой лежит
 * служебное. Слово «Главная» ушло: по нему не было видно, что за ним
 * меню, — теперь меню и есть полоса, а на главную ведёт знак, как везде.
 *
 * Редактор материала и рабочее место письма живут под этой же полосой:
 * именно там человек терялся — «зашёл в редактор, а к письмам только
 * назад». Полоса тонкая, и лист ниже неё получает ту же высоту, что
 * раньше: высота идёт от окна, а не от содержимого.
 */
export function AppShell() {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  // На главной возвращаться некуда: шаг назад оттуда — уже наружу кабинета.
  const canGoBack = pathname !== '/';

  /*
   * Escape — шаг назад по своим следам.
   *
   * Раньше он выбрасывал на главную, и это было хуже неожиданности:
   * человек терял место, куда шёл. Теперь делает ровно то же, что
   * стрелка рядом, — и поэтому подписан на ней.
   *
   * Уступаем всем, для кого Escape уже что-то значит, иначе одно
   * нажатие закрывало бы диалог и вместе с ним уводило со страницы:
   *
   * — открытому диалогу или меню: они закрывают себя сами;
   * — полю ввода: там Escape отменяет правку;
   * — странице, которая сама обработала нажатие (`preventDefault`), —
   *   так «Документы» сначала снимают поиск и выходят из папки.
   */
  useEffect(() => {
    if (!canGoBack) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (document.querySelector('[role="dialog"], [role="menu"]')) return;

      const active = document.activeElement;
      if (
        active instanceof HTMLElement &&
        (active.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName))
      ) {
        return;
      }

      navigate(-1);
    };

    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [canGoBack, navigate]);

  return (
    <div className="flex h-full flex-col">
      <header className="z-20 shrink-0 border-b border-[var(--line)] bg-[var(--surface)]">
        <div className="flex h-13 items-center gap-2 px-3 sm:px-4">
          {/* Бургер — только на узком экране, где полосы нет. */}
          <BurgerMenu />

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

      {/* Возврат — своей строкой под шапкой, а не в ней.
          В шапке он появлялся и исчезал вместе со страницей и каждый раз
          двигал знак вбок: на главной знак стоял у края, на любой другой
          странице — на сорок пикселей правее. Здесь он никого не толкает,
          а строки нет там, где возвращаться некуда. */}
      {canGoBack && (
        <div className="shrink-0 px-2 pt-1.5 sm:px-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            title="Назад (Esc)"
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text)]"
          >
            <ArrowLeft size={17} />
            Назад
          </button>
        </div>
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
