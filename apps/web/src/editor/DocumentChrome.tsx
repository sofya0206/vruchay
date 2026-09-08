import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, FileText, Table2 } from 'lucide-react';
import { useMe } from '../auth/useAuth';
import { workspacePath } from '../mailing/workspace-tabs';
import { MenuBar, type MenuDef } from './MenuBar';

/**
 * Рамка страницы материала: название, строка меню, переключатель «Редактор —
 * Таблица» и панель значков.
 *
 * Одна на оба экрана. Лист и таблица — две стороны одного материала, и человек
 * ходит между ними десятки раз за вечер: пока рамка у них была разная, каждый
 * переход выглядел уходом в другой раздел, а обратная дорога искалась заново.
 * Теперь при переключении меняется только содержимое под панелью, а название,
 * меню и переключатель стоят на месте.
 *
 * Ширину не ограничиваем: обе страницы работают во весь экран, и колонка
 * по центру отняла бы у листа поля, а у таблицы — колонки.
 */
export function DocumentChrome({
  documentId,
  title,
  menus,
  view,
  toolbar,
  action,
}: {
  documentId: string;
  title: string;
  menus: MenuDef[];
  /** Какая сторона материала открыта — она подсвечена в переключателе. */
  view: 'editor' | 'table';
  /** Панель значков под меню. Своя у листа и у таблицы. */
  toolbar?: ReactNode;
  /** Главное действие страницы — справа, у самого края. */
  action?: ReactNode;
}) {
  const me = useMe();
  const person = me.data?.name?.trim() || me.data?.email || '';

  return (
    <header className="shrink-0 border-b border-[var(--line)] bg-[var(--surface)]">
      <div className="flex items-start gap-3 px-3 pt-2 pb-1.5">
        {/* Возврат в библиотеку — стрелкой в левом верхнем углу, как
            на любой странице документа. */}
        <Link
          to="/documents"
          title="Все материалы"
          aria-label="Все материалы"
          className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[var(--accent)] transition-colors hover:bg-[var(--surface-sunken)]"
        >
          <ArrowLeft size={19} />
        </Link>

        <div className="min-w-0">
          <h1 className="truncate text-xl leading-tight">{title}</h1>
          <div className="-ml-2 mt-0.5">
            <MenuBar menus={menus} />
          </div>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <div className="flex items-center gap-1 rounded-xl bg-[var(--surface-sunken)] p-1">
            <ViewLink to={`/documents/${documentId}`} active={view === 'editor'} icon={<FileText size={16} />}>
              Редактор
            </ViewLink>
            <ViewLink to={workspacePath(documentId)} active={view === 'table'} icon={<Table2 size={16} />}>
              Таблица
            </ViewLink>
          </div>

          {/* Справка — там же, где её ищут: у самого правого края, рядом
              с учётной записью. */}
          <Link
            to="/docs"
            title="Показать справку"
            aria-label="Показать справку"
            className="grid h-9 w-9 place-items-center rounded-full bg-[var(--award-soft)] text-sm font-medium text-[var(--award)] transition-opacity hover:opacity-80"
          >
            ?
          </Link>

          {action}

          <Link
            to="/settings"
            title={person}
            aria-label="Учётная запись"
            className="grid h-9 w-9 place-items-center rounded-full bg-[var(--surface-sunken)] text-sm font-medium text-[var(--text-muted)] transition-colors hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]"
          >
            {person.slice(0, 1).toUpperCase() || '·'}
          </Link>
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
