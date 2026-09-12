import { useEffect, type CSSProperties } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, RotateCw } from 'lucide-react';
import { InstallHint } from '../ui/InstallHint';
import { AccountMenu } from './AccountMenu';
import { BurgerMenu } from './BurgerMenu';
import { TopNav } from './TopNav';

/** Высота строки со стрелкой возврата; на главной строки нет. */
const BACK_ROW = '48px';

/**
 * Оболочка кабинета: полоса разделов сверху — на каждом экране.
 *
 * Слева знак и пять разделов, справа — обновление и учётная запись, под
 * которой лежит служебное. Слово «Главная» ушло: по нему не было видно,
 * что за ним меню, — теперь меню и есть полоса, а на главную ведёт знак,
 * как везде. Набрано в полный рост: знак 44 пункта, слово — 24, высота
 * из `--app-header` — под шапкой приклеены колонки разделов, и они
 * отсчитывают своё место от неё.
 *
 * Редактор материала и рабочее место письма живут под этой же полосой:
 * именно там человек терялся — «зашёл в редактор, а к письмам только
 * назад». Высоту им даёт обёртка `Outlet`: ровно окно минус шапка минус
 * строка возврата, чтобы лист получил всё, что осталось, и не появился
 * лишний скролл. Страницы длиннее окна из обёртки просто выступают —
 * прокручивает их само окно, как и раньше, и липкие колонки разделов
 * продолжают считать своё место от шапки.
 */
export function AppShell() {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  /*
   * Материал — лист, список, письмо — рисует стрелку «Назад» сам, в своей
   * строке рядом с названием: отдельная строка над лентой вкладок стояла
   * пустой и отнимала высоту у листа. И Escape там не назначен: в
   * редакторе он снимает выделение блока без preventDefault, и общий
   * «Esc — назад» уводил бы со страницы посреди правки.
   */
  const inMaterial = /^\/(documents|mailing)\/[^/]+/.test(pathname);

  // На главной возвращаться некуда: шаг назад оттуда — уже наружу кабинета.
  const canGoBack = pathname !== '/' && !inMaterial;
  const escGoesBack = canGoBack;

  /*
   * Escape — шаг назад по своим следам, то же, что стрелка под шапкой.
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
    if (!escGoesBack) return;

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
  }, [escGoesBack, navigate]);

  return (
    <div
      className="flex min-h-full flex-col"
      style={{ '--back-row': canGoBack ? BACK_ROW : '0px' } as CSSProperties}
    >
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

          <div className="ml-auto flex items-center gap-1">
            <RefreshButton />
            <AccountMenu />
          </div>
        </div>
      </header>

      {/* Возврат — своей строкой под шапкой, а не в ней: в шапке он
          появлялся и исчезал вместе со страницей и каждый раз двигал знак
          вбок. Здесь он никого не толкает, а строки нет там, где
          возвращаться некуда. Без подписи: слово ничего не добавляло к
          стрелке; название — в подсказке и для чтения с экрана. */}
      {canGoBack && (
        <div className="flex h-[var(--back-row)] shrink-0 items-center px-2 sm:px-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            title="Назад (Esc)"
            aria-label="Назад"
            className="grid h-11 w-11 place-items-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text)]"
          >
            <ArrowLeft size={20} />
          </button>
        </div>
      )}

      <div className="flex h-[calc(100dvh-var(--app-header)-var(--back-row))] shrink-0 flex-col">
        <Outlet />
      </div>

      <InstallHint />
    </div>
  );
}

/**
 * Обновить то, что на экране.
 *
 * Данные кабинета кэшируются, и после правки на другом устройстве или
 * в соседней вкладке экран показывает вчерашнее. Кнопка сбрасывает кэш
 * целиком — перезагружать страницу ради этого не нужно, а перезагрузка
 * вдобавок теряет место в списке.
 *
 * Значок вращается, пока идут запросы: иначе непонятно, нажалось ли, —
 * ответ приходит быстрее, чем человек успевает посмотреть на экран.
 */
function RefreshButton() {
  const qc = useQueryClient();
  const fetching = useIsFetching() > 0;

  return (
    <button
      type="button"
      title="Обновить"
      aria-label="Обновить"
      onClick={() => void qc.invalidateQueries()}
      className="grid h-11 w-11 place-items-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text)]"
    >
      <RotateCw size={20} className={fetching ? 'animate-spin' : undefined} />
    </button>
  );
}
