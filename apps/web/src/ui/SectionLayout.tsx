import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { ChevronsUpDown, type LucideIcon } from 'lucide-react';
import { BottomSheet } from './BottomSheet';
import { cn } from './cn';

/**
 * Рама раздела с колонкой: слева списки, сверху панель с названием
 * и действиями, снизу строка состояния. Одна на документы, письма,
 * настройки и интеграции — устроенные одинаково разделы осваивают один раз.
 *
 * Колонка и обе полосы приклеены: список длинный, а «сколько всего»
 * и «создать» нужны в любой момент прокрутки. На телефоне колонка стоит
 * над панелью и превращается в ленту.
 */
export function SectionLayout({
  column,
  head,
  tools,
  bar,
  children,
  columnTitle = 'Разделы',
}: {
  /** Содержимое левой колонки: кнопка создания, списки. */
  column: ReactNode;
  head: ReactNode;
  tools?: ReactNode;
  bar?: ReactNode;
  children: ReactNode;
  /** Заголовок нижнего листа с колонкой на телефоне. */
  columnTitle?: string;
}) {
  /*
   * Телефон: колонки нет, её разделы открываются нижним листом по нажатию
   * на заголовок — как «Мой диск» в Google Диске или название страницы
   * в Notion. Лента значков над списком была непонятной без подписей,
   * а с подписями не помещалась и листалась вбок.
   */
  const [open, setOpen] = useState(false);
  const { pathname, search } = useLocation();
  useEffect(() => setOpen(false), [pathname, search]);

  return (
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      <aside className="border-b border-line max-md:hidden md:w-60 md:shrink-0 md:border-r md:border-b-0">
        <div className="p-3 max-md:px-2 max-md:py-2 md:sticky md:top-[var(--app-header)] md:max-h-[calc(100vh-var(--app-header))] md:overflow-y-auto">
          {column}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* На телефоне заголовок — своей строкой, инструменты (поиск) — второй
            во всю ширину: в одну строку поле поиска сжималось до обрывка. */}
        <div className="z-10 flex flex-wrap items-center gap-3 border-b border-line bg-surface px-6 py-3 max-md:gap-2 max-md:px-4 md:sticky md:top-[var(--app-header)]">
          <div className="min-w-[10rem] flex-1 max-md:hidden">{head}</div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-haspopup="dialog"
            aria-label={`${columnTitle}: выбрать`}
            className="-mx-1 flex min-w-0 basis-full items-center gap-1.5 rounded-control px-1 py-0.5 text-left active:bg-sunken md:hidden"
          >
            <span className="min-w-0">{head}</span>
            <ChevronsUpDown size={16} className="shrink-0 text-muted" />
          </button>
          {tools && <div className="flex min-w-0 items-center gap-2 max-md:w-full max-md:[&>*:first-child]:flex-1">{tools}</div>}
        </div>

        <main className="min-w-0 flex-1 px-6 py-6 max-md:px-4 max-md:py-4">{children}</main>

        {bar && (
          <div
            className="sticky bottom-0 z-10 flex flex-wrap items-center gap-3 border-t border-line bg-surface px-4 pt-2.5 text-sm sm:px-6"
            // Полоса «домой» у айфонов без кнопки: панель над ней, а не под ней.
            style={{ paddingBottom: 'max(10px, env(safe-area-inset-bottom))' }}
          >
            {bar}
          </div>
        )}
      </div>
      <BottomSheet open={open} onClose={() => setOpen(false)} title={columnTitle}>
        <div className="px-2 pb-3">{column}</div>
      </BottomSheet>
    </div>
  );
}

/**
 * Рама раздела без колонки: та же панель сверху, что у `SectionLayout`,
 * но без списка слева — для разделов без внутренних папок (Реестр, Счета,
 * Оплата).
 *
 * Раньше такие разделы начинались большим заголовком с абзацем-подводкой
 * и отступом до него: рядом с «Документами» или «Письмами», где название
 * раздела стоит вплотную к шапке, это читалось как переход на другую
 * страницу, а не соседний раздел одного кабинета. Теперь панель везде
 * на одной высоте и одного роста.
 */
export function PageLayout({
  head,
  tools,
  children,
}: {
  head: ReactNode;
  tools?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="z-10 flex flex-wrap items-center gap-3 border-b border-line bg-surface px-6 py-3 md:sticky md:top-[var(--app-header)]">
        <div className="min-w-[10rem] flex-1">{head}</div>
        {tools}
      </div>

      <main className="min-w-0 flex-1 px-6 py-6">{children}</main>
    </div>
  );
}

/** Название списка в панели раздела — с числом, если есть. */
export function SectionTitle({ children, count }: { children: ReactNode; count?: number | null }) {
  return (
    <div className="flex min-w-0 items-baseline gap-2">
      <h1 className="truncate text-lg font-medium">{children}</h1>
      {count != null && <span className="tabular text-sm text-muted">{count}</span>}
    </div>
  );
}

/** Список колонки — столбик; на телефоне он живёт в нижнем листе раздела. */
export function ColumnList({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <ul className={cn('flex flex-col gap-1', className)}>
      {children}
    </ul>
  );
}

/**
 * Общий вид строки колонки — один на документы, письма, настройки
 * и интеграции.
 *
 * Собирается через `cn`, а не склейкой строк: у Tailwind порядок классов
 * в атрибуте ничего не решает, побеждает тот, что стоит позже в собранном
 * CSS. Библиотека склеивала строкой и передавала `px-0` поверх `px-3` —
 * отступ не отменялся, а складывался с отступом внутренней ссылки, и до
 * значка папки выходило 52 точки вместо двадцати.
 *
 * Высота 32 точки на широком экране: строка списка, а не кнопка. На узком
 * колонка превращается в ленту, которую листают пальцем, — там остаётся
 * 36, иначе в строку не попасть.
 */
export function columnRowClass({ active, nested }: { active?: boolean; nested?: boolean } = {}): string {
  return cn(
    'flex min-w-0 flex-1 items-center gap-2.5 rounded-md px-3 py-2 text-sm whitespace-nowrap transition-colors md:px-2 md:py-1.5',
    // Телефон: строка нижнего листа — под палец, обычным кеглем.
    'max-md:min-h-12 max-md:rounded-card max-md:text-base',
    // Вложенная строка отступает на ширину значка родителя: папки читаются
    // как ветка «Моих документов», а не как второй плоский список.
    nested && 'max-md:pl-9 md:pl-5 md:text-[13px]',
    active
      ? 'bg-accent-soft font-medium text-accent'
      : 'text-muted hover:bg-row-hover hover:text-ink',
  );
}

/**
 * Строка колонки — ссылка на список. Активность считается снаружи:
 * у папок один адрес и разный `?folder=`, о котором `NavLink` не знает.
 */
export function ColumnRow({
  to,
  icon: Icon,
  active,
  count,
  nested,
  tint,
  children,
  onContextMenu,
  trailing,
}: {
  to: string;
  icon: LucideIcon;
  active?: boolean;
  count?: number | null;
  nested?: boolean;
  /** Цвет иконки в покое, например красный у «Не доставлено». */
  tint?: string;
  children: ReactNode;
  onContextMenu?: (e: React.MouseEvent<HTMLElement>) => void;
  /** Что стоит справа от строки (например, «…»). */
  trailing?: ReactNode;
}) {
  return (
    <li className="group flex items-center">
      <NavLink
        to={to}
        end
        aria-current={active ? 'page' : undefined}
        onContextMenu={onContextMenu}
        className={columnRowClass({ active, nested })}
      >
        <Icon size={16} strokeWidth={1.75} className={cn('shrink-0 max-md:size-5', !active && tint)} />
        <span className="flex-1 truncate">{children}</span>
        {count ? <span className="tabular text-xs text-muted max-md:text-sm">{count}</span> : null}
      </NavLink>
      {trailing}
    </li>
  );
}
