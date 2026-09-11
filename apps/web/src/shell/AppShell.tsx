import { useEffect } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import { LogOut, PenLine, Receipt, RotateCw, Settings } from 'lucide-react';
import { useLogout, useMe } from '../auth/useAuth';
import { useOverview } from '../api/overview';
import { Button } from '../ui/Button';
import { InstallHint } from '../ui/InstallHint';

/**
 * Оболочка кабинета: шапка и возврат на главную.
 *
 * Разделов в шапке больше нет — они живут на главной. Лента из семи подписей
 * дублировала главную и при этом ничего о разделах не говорила: на узком
 * экране она уезжала вбок, и «Реестр» от «Аналитики» отличался только словом.
 *
 * В шапке ровно две группы и обе прижаты к краям окна: возврат на главную
 * слева, работа с учётной записью справа. Ни хлебных крошек, ни названия
 * раздела: у разделов есть свои заголовки, и повтор давал третью полосу
 * подписей подряд.
 *
 * Набрано в полный рост: знак 44 пункта, слово — 24. Мелкая полоса подписей
 * поверх широкого экрана читается как черновик, а шапка — первое, по чему
 * судят о размере всего остального.
 */
export function AppShell() {
  const me = useMe();
  const logout = useLogout();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  // Куда ведёт «Редактор». Правят почти всегда последний материал — тот же,
  // что открыт в работе. Материалов нет — ведём в «Документы», там создают.
  const overview = useOverview();
  const latest = overview.data?.documents[0];
  const editorPath = latest ? `/documents/${latest.id}` : '/documents';

  /*
   * Escape — выход из раздела на главную.
   *
   * Главная и есть навигация по кабинету, поэтому дорога назад нужна
   * та же, что закрывает всё остальное: раздел открыли, посмотрели,
   * вышли — не отыскивая кнопку в углу.
   *
   * Уступаем всем, для кого Escape уже что-то значит, — иначе одно
   * нажатие закрывало бы диалог и вместе с ним выбрасывало из раздела:
   *
   * — открытому диалогу или меню: они закрывают себя сами;
   * — полю ввода: там Escape отменяет правку;
   * — разделу, который сам обработал нажатие (`preventDefault`), —
   *   так «Документы» сначала снимают поиск и выходят из папки.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || pathname === '/') return;
      if (document.querySelector('[role="dialog"], [role="menu"]')) return;

      const active = document.activeElement;
      if (
        active instanceof HTMLElement &&
        (active.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName))
      ) {
        return;
      }

      navigate('/');
    };

    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [pathname, navigate]);

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-20 border-b border-[var(--line)] bg-[var(--surface)]">
        {/* Во всю ширину окна, а не колонкой по центру: шапка — рама экрана,
            и на ноутбуке её края должны совпадать с краями экрана.

            Высота взята из --app-header: под шапкой приклеены колонки
            разделов, и они отсчитывают своё место от неё. Минус пиксель —
            нижняя линия, она входит в ту же высоту. */}
        <div className="flex h-[calc(var(--app-header)-1px)] items-center gap-3 px-5">
          {/* Возврат на главную — левый верхний угол: знак и слово одной
              ссылкой. Знак снимали как раз потому, что отдельным квадратом
              он читался как ещё одна кнопка; внутри ссылки он часть её,
              а заголовок набран крупно — по нему опознают этаж кабинета,
              не вчитываясь. */}
          <Link
            to="/"
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
            <span className="text-2xl">Главная</span>
          </Link>

          <RefreshButton />

          <div className="ml-auto flex items-center gap-3">
            {/* Редактирование остаётся наверху: к листу возвращаются
                из любого места и по многу раз за день. */}
            <Link
              to={editorPath}
              title="Редактор макета"
              aria-label="Редактор макета"
              className="inline-flex items-center gap-2 rounded-lg px-2.5 py-2 text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text)]"
            >
              <PenLine size={17} />
              <span className="hidden sm:inline">Редактор</span>
            </Link>

            <span className="hidden text-[var(--text-muted)] lg:inline">
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
                className="inline-flex items-center gap-2 rounded-lg px-2.5 py-2 text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text)]"
              >
                <Receipt size={17} />
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
              className="inline-flex items-center gap-2 rounded-lg px-2.5 py-2 text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text)]"
            >
              <Settings size={17} />
              <span className="hidden sm:inline">Настройки</span>
            </Link>
            <Button
              variant="ghost"
              className="px-2.5 py-2"
              icon={<LogOut size={17} />}
              onClick={() => logout.mutate()}
            >
              <span className="hidden sm:inline">Выйти</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Колонка, а не просто блок: страница, которой нужна вся высота окна
          (входное обучение), берёт её через flex-1. Остальным это ничего
          не меняет — без flex-1 высота по-прежнему по содержимому. */}
      <div className="flex flex-1 flex-col">
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
      className="rounded-lg p-2 text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text)]"
    >
      <RotateCw size={20} className={fetching ? 'animate-spin' : undefined} />
    </button>
  );
}
