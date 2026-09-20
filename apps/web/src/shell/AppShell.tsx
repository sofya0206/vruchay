import { useEffect, useRef, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { InstallHint } from '../ui/InstallHint';
import { Toaster } from '../ui/Toast';
import { useMe } from '../auth/useAuth';
import { Guide } from '../onboarding/Guide';
import { SectionTips } from '../onboarding/SectionTips';
import { onboarding } from '../onboarding/store';
import { AccountMenu } from './AccountMenu';
import { Brand } from './Brand';
import { BurgerMenu } from './BurgerMenu';
import { HelpMenu } from './HelpMenu';
import { SideNav } from './SideNav';

const SIDEBAR_KEY = 'vruchay:sidebar';

function storedCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_KEY) === 'collapsed';
  } catch {
    return false;
  }
}

/** Документ на любом шаге: листу и таблице нужна вся ширина, колонка сама сжимается в рейку. */
function isMaterial(pathname: string): boolean {
  return /^\/documents\/(?!archive$|templates$)[^/]+/.test(pathname);
}

/**
 * Оболочка кабинета: колонка разделов слева — на каждом экране.
 *
 * На широком экране верхней полосы нет: знак, помощь и аккаунт живут
 * в колонке, а каждая страница получает лишние 56 точек по высоте.
 * На телефоне колонки нет, и полоса сверху держит бургер, знак, помощь
 * и учётную запись.
 *
 * Стрелки «назад» нет: дорога назад у каждой страницы своя и подписана.
 *
 * Высоту редактору и рабочему месту даёт обёртка `Outlet`: ровно окно
 * минус полоса (на широком экране — ноль), чтобы лист получил всё, что
 * осталось. Страницы длиннее окна из обёртки просто выступают —
 * прокручивает их само окно, и липкие колонки продолжают считать своё
 * место от полосы.
 */
export function AppShell() {
  const { pathname } = useLocation();
  const email = useMe().data?.email;

  // Погасшие подсказки у каждого, кто вошёл, свои.
  useEffect(() => {
    if (email) onboarding.load(email);
  }, [email]);

  /*
   * Колонка разделов: человек сворачивает её сам, и это запоминается.
   * В документе она свёрнута всегда, но развернуть на время можно.
   * При переходе колонка остаётся такой, какой была в момент перехода.
   */
  const [stored, setStored] = useState(storedCollapsed);
  const [override, setOverride] = useState<boolean | null>(null);

  const forced = isMaterial(pathname);
  const collapsed = override ?? (forced || stored);

  const collapsedRef = useRef(collapsed);
  collapsedRef.current = collapsed;
  useEffect(() => {
    setOverride(null);
    remember(collapsedRef.current);
  }, [pathname]);

  function remember(next: boolean) {
    setStored(next);
    try {
      localStorage.setItem(SIDEBAR_KEY, next ? 'collapsed' : 'open');
    } catch {
      // Приватное окно: колонка не запомнится, и только.
    }
  }

  function toggleSidebar() {
    if (forced) {
      setOverride(!collapsed);
      return;
    }
    remember(!stored);
  }

  return (
    <div className="flex min-h-full flex-col">
      {/* Верхняя полоса — только на телефоне. Минус пиксель — нижняя линия входит в ту же высоту. */}
      <header className="sticky top-0 z-20 shrink-0 border-b border-line bg-surface md:hidden">
        <div className="flex h-[calc(var(--app-header)-1px)] items-center gap-1 px-2">
          <BurgerMenu />
          <Link
            to="/"
            aria-label="На главную"
            className="pressable inline-flex items-center gap-2.5 rounded-control px-2 py-1.5 hover:bg-sunken"
          >
            <Brand size={28} />
            <span className="text-lg font-medium">Вручай</span>
          </Link>
          <div className="ml-auto flex items-center gap-1">
            <HelpMenu variant="icon" />
            <AccountMenu variant="avatar" />
          </div>
        </div>
      </header>

      <div className="flex flex-1">
        <SideNav collapsed={collapsed} onToggle={toggleSidebar} />

        {/* `min-w-0` обязателен: лента шагов, холст и таблица реестра
            прокручиваются внутри себя, а без него они распирали бы колонку
            и вместе с ней всю страницу вбок. Высота — `min-h`, а не `h`:
            с жёсткой высотой липкая колонка теряла прилипание на длинных
            страницах. */}
        <div className="flex min-h-[calc(100dvh-var(--app-header))] min-w-0 flex-1 flex-col">
          <Outlet />
        </div>
      </div>

      <InstallHint />
      <SectionTips />
      <Guide />
      <Toaster />
    </div>
  );
}
