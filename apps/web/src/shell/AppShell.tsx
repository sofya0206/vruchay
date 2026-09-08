import { useEffect } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { LogOut, PenLine, Receipt, Settings } from 'lucide-react';
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
            и на ноутбуке её края должны совпадать с краями экрана. */}
        <div className="flex items-center gap-3 px-6 py-3">
          {/* Возврат на главную — левый верхний угол, одним словом.
              Знака здесь нет: шапка не витрина марки, а рабочая полоса,
              и синий квадрат рядом со словом читался как ещё одна кнопка. */}
          <Link
            to="/"
            className="rounded-lg px-2 py-1.5 font-medium transition-colors hover:bg-[var(--surface-sunken)]"
          >
            Главная
          </Link>

          <div className="ml-auto flex items-center gap-3">
            {/* Редактирование остаётся наверху: к листу возвращаются
                из любого места и по многу раз за день. */}
            <Link
              to={editorPath}
              title="Редактор макета"
              aria-label="Редактор макета"
              className="inline-flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text)]"
            >
              <PenLine size={15} />
              <span className="hidden sm:inline">Редактор</span>
            </Link>

            <span className="hidden text-sm text-[var(--text-muted)] lg:inline">
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
