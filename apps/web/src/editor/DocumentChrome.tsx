import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, FileText, Table2 } from 'lucide-react';
import { materialTabPath, workspacePath, type MaterialTab } from '../mailing/workspace-tabs';
import { MenuBar, type MenuDef } from './MenuBar';

/**
 * Рамка страницы материала: хребет из вкладок и строка меню под ним.
 *
 * Одна на все стороны материала. Лист, список, правила, проверка, письмо
 * и подлинность — не разные разделы, а один материал с разных сторон, и
 * пока ленты не было, дорога от листа к письму шла через главную: три
 * нажатия и ни одного очевидного. Теперь при переходе меняется только
 * содержимое под рамкой.
 *
 * Верхний ряд — тонкий, 44 px: над ним стоит такая же по высоте общая
 * полоса кабинета, и вдвоём они уже забирают у листа заметную часть
 * экрана. Поэтому здесь нет ни учётной записи, ни значка справки, ни
 * стрелки возврата — всё это живёт в общей полосе, а справка ещё и
 * в меню «Справка». Своя стрелка встала бы прямо под чужой, и две
 * одинаковые стрелки друг под другом вели бы в разные места.
 *
 * Ширину не ограничиваем: обе страницы работают во весь экран, и колонка
 * по центру отняла бы у листа поля, а у таблицы — колонки.
 */
export function DocumentChrome({
  documentId,
  title,
  menus,
  tab,
  toolbar,
  action,
}: {
  documentId: string;
  title: string;
  menus: MenuDef[];
  /** Какая сторона материала открыта — она подсвечена в ленте вкладок. */
  tab: MaterialTab;
  /** Панель значков под меню. Своя у листа и у таблицы. */
  toolbar?: ReactNode;
  /**
   * Чем «Выпустить» занимается на этой вкладке.
   *
   * Выпускать можно только со списка — там отмечают, кому. На остальных
   * вкладках кнопка остаётся на месте и ведёт к списку: место главного
   * действия не должно переезжать от вкладки к вкладке.
   */
  action?: ReactNode;
}) {
  /*
   * «Назад» из материала — наверх, в список документов, а не по истории
   * браузера: история ведёт туда, откуда пришёл, — с шага «Подлинность»
   * на лист, а с листа обратно в «Подлинность», — и человек ходит
   * кругами, не находя выхода в кабинет.
   */
  const back = (
    <Link
      to="/documents"
      title="К документам"
      aria-label="К документам"
      className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text)]"
    >
      <ArrowLeft size={19} />
    </Link>
  );

  const issue = action ?? (
    <Link
      to={workspacePath(documentId)}
      title="Отметить получателей и выпустить документы"
      className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-2.5 py-1.5 text-sm font-medium text-[var(--accent-contrast)] transition-colors hover:bg-[var(--accent-hover)]"
    >
      Выпустить
    </Link>
  );

  /*
   * Рамка одна на все стороны материала: крупное название, меню под ним,
   * справа переключатель «Редактор — Таблица». Ленты вкладок здесь нет
   * по решению владельца: на листе работают с макетом, в таблице — со
   * списком, и шесть подписей над ними — шум. Всё, что идёт после
   * таблицы, — правила, проверка, подлинность, письмо — не вкладки,
   * а шаги выпуска: их ведёт своя строка под рамкой.
   */
  return (
    <header className="shrink-0 border-b border-[var(--line)] bg-[var(--surface)]">
      <div className="flex items-start gap-3 px-3 pt-2 pb-1.5">
        <div className="mt-0.5">{back}</div>

        <div className="min-w-0">
          <h1 className="truncate text-xl leading-tight">{title}</h1>
          <div className="-ml-2 mt-0.5">
            <MenuBar menus={menus} />
          </div>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <div className="flex items-center gap-1 rounded-xl bg-[var(--surface-sunken)] p-1">
            <ViewLink
              to={materialTabPath(documentId, 'sheet')}
              active={tab === 'sheet'}
              icon={<FileText size={16} />}
            >
              Редактор
            </ViewLink>
            <ViewLink
              to={workspacePath(documentId)}
              active={tab !== 'sheet'}
              icon={<Table2 size={16} />}
            >
              Таблица
            </ViewLink>
          </div>
          {issue}
        </div>
      </div>

      {toolbar && (
        <div className="flex flex-wrap items-center gap-1 px-3 pb-1.5" role="toolbar">
          {toolbar}
        </div>
      )}
    </header>
  );
}

/** Переключатель сторон материала на листе: «Редактор — Таблица». */
function ViewLink({
  to,
  active,
  icon,
  children,
}: {
  to: string;
  active: boolean;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <Link
      to={to}
      aria-current={active ? 'page' : undefined}
      className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
        active
          ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
          : 'text-[var(--text-muted)] hover:bg-[var(--surface)] hover:text-[var(--text)]'
      }`}
    >
      {icon}
      {children}
    </Link>
  );
}

/** Значок на панели под меню: квадратная кнопка без подписи. */
export function ToolButton({
  title,
  onClick,
  active = false,
  disabled = false,
  children,
}: {
  title: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`grid h-8 w-8 place-items-center rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        active
          ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
          : 'text-[var(--text-muted)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text)]'
      }`}
    >
      {children}
    </button>
  );
}

/** Черта между смысловыми группами значков. */
export function ToolDivider() {
  return <span aria-hidden className="mx-1 h-5 w-px bg-[var(--line)]" />;
}
