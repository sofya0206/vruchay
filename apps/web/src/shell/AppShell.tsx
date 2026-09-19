import { useEffect, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { InstallHint } from '../ui/InstallHint';
import { useMe } from '../auth/useAuth';
import { Guide } from '../onboarding/Guide';
import { HintCard } from '../onboarding/HintCard';
import { HelpButton } from '../onboarding/HelpButton';
import { SectionTips } from '../onboarding/SectionTips';
import { onboarding } from '../onboarding/store';
import { AccountMenu } from './AccountMenu';
import { Brand } from './Brand';
import { BurgerMenu } from './BurgerMenu';
import { SideNav } from './SideNav';

const SIDEBAR_KEY = 'vruchay:sidebar';

function storedCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_KEY) === 'collapsed';
  } catch {
    return false;
  }
}

/** Материал и его письмо: листу нужна вся ширина, колонка сама сжимается в рейку. */
function isMaterial(pathname: string): boolean {
  return /^\/(documents|mailing)\/[^/]+/.test(pathname);
}

/**
 * Оболочка кабинета: шапка сверху, колонка разделов слева — на каждом экране.
 *
 * Стрелки «назад» нет: дорога назад у каждой страницы своя и подписана —
 * путь в заголовке вложенного экрана, ссылка на список, колонка слева.
 * Безымянная стрелка по истории браузера дублировала кнопку самого
 * браузера и ела строку на каждом экране.
 *
 * Высоту редактору и рабочему месту письма даёт обёртка `Outlet`: ровно
 * окно минус шапка, чтобы лист получил всё, что осталось, и не появился
 * лишний скролл. Страницы длиннее окна из обёртки просто выступают —
 * прокручивает их само окно, и липкие колонки разделов продолжают
 * считать своё место от шапки.
 */
export function AppShell() {
  const { pathname } = useLocation();
  const email = useMe().data?.email;

  // Погасшие точки у каждого, кто вошёл, свои.
  useEffect(() => {
    if (email) onboarding.load(email);
  }, [email]);

  /*
   * Колонка разделов: человек сворачивает её сам, и это запоминается.
   * В материале она свёрнута всегда, но развернуть на время можно —
   * такой временный выбор в хранилище не пишем, иначе, выйдя из
   * редактора, человек нашёл бы колонку не в том виде, в каком оставил.
   */
  const [stored, setStored] = useState(storedCollapsed);
  const [override, setOverride] = useState<boolean | null>(null);
  useEffect(() => setOverride(null), [pathname]);

  const forced = isMaterial(pathname);
  const collapsed = override ?? (forced || stored);

  function toggleSidebar() {
    if (forced) {
      setOverride(!collapsed);
      return;
    }
    const next = !stored;
    setStored(next);
    try {
      localStorage.setItem(SIDEBAR_KEY, next ? 'collapsed' : 'open');
    } catch {
      // Приватное окно: колонка не запомнится, и только.
    }
  }

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-20 shrink-0 border-b border-[var(--line)] bg-[var(--surface)]">
        {/* Во всю ширину окна, а не колонкой по центру: шапка — рама экрана.
            Минус пиксель — нижняя линия, она входит в ту же высоту. */}
        <div className="flex h-[calc(var(--app-header)-1px)] items-center gap-3 px-3 sm:px-5">
          {/* Бургер — только на узком экране, где колонки нет. */}
          <BurgerMenu />

          <Link
            to="/"
            aria-label="На главную"
            className="-mx-2 inline-flex items-center gap-3 rounded-xl px-2 py-1.5 transition-colors hover:bg-[var(--surface-sunken)]"
          >
            <Brand size={40} />
            <span className="text-2xl font-medium">Вручай</span>
          </Link>

          <div className="ml-auto flex items-center gap-1">
            <HelpButton />
            <AccountMenu />
          </div>
        </div>
      </header>

      <div className="flex flex-1">
        <SideNav collapsed={collapsed} onToggle={toggleSidebar} />

        {/* `min-w-0` обязателен: лента вкладок редактора, холст и таблица
            реестра прокручиваются внутри себя, а без него они распирали бы
            колонку и вместе с ней всю страницу вбок.

            Высота — `min-h`, а не `h`: с жёсткой высотой эта строка (и вместе
            с ней колонка разделов) обрывалась ровно на одном экране, а более
            длинная страница просто рисовалась поверх обрыва. Тогда `sticky`
            внутри колонки разделов упирался в потолок этой обрубленной рамки
            и переставал липнуть, как только страница прокручивалась дальше
            первого экрана, — колонка «уезжала». `min-h` держит экран как
            минимум, но растёт вместе с содержимым, и колонка разделов
            растягивается вровень с ним на всю длину страницы.

            Страницам с фиксированной высотой — редактору листа и рабочему
            месту материала — при этом константа не нужна отсюда: у них есть
            свой собственный `h-[calc(100dvh-var(--app-header))]` в корне. */}
        <div className="flex min-h-[calc(100dvh-var(--app-header))] min-w-0 flex-1 flex-col">
          <Outlet />
        </div>
      </div>

      <InstallHint />
      <HintCard />
      <SectionTips />
      <Guide />
    </div>
  );
}
