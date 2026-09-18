import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CheckCheck, ChevronRight, MoreHorizontal, Variable } from 'lucide-react';
import { MATERIAL_TABS, materialTabPath, workspacePath, type MaterialTab } from '../mailing/workspace-tabs';
import { IconButton } from '../ui/IconButton';
import { Menu, MenuDivider, MenuItem } from '../ui/Menu';
import { toggleFieldsPanel, useFieldsPanelOpen } from './fields-sidebar-store';

/** Пункт меню «…» либо разделитель между смысловыми группами. */
export type MenuEntry =
  | { separator: true }
  | {
      separator?: false;
      icon?: ReactNode;
      label: string;
      /** Горячая клавиша — справа серым. */
      shortcut?: string;
      onSelect: () => void;
      disabled?: boolean;
      /** Опасное действие — красным. Такое в меню всегда последнее. */
      danger?: boolean;
    };

/**
 * Рамка страницы материала: путь, лента вкладок, действие и меню «…».
 *
 * Одна на все стороны материала. Лист, список, правила, проверка, письмо
 * и подлинность — не разные разделы, а один материал с разных сторон:
 * при переходе меняется только содержимое под рамкой.
 *
 * Путь «Документы › Название» — и заголовок, и дорога назад: подписанная,
 * а не безымянная стрелка по истории браузера.
 *
 * Строки меню «Файл / Правка / Вставка» больше нет: половина её пунктов
 * стояла ещё раз на панели значков, а вторая половина повторяла ленту
 * вкладок словами. Что осталось — действия над материалом целиком и
 * редкие правки — лежит в одном меню «…» рядом с «Выпустить».
 */
export function DocumentChrome({
  documentId,
  title,
  actions,
  tab,
  toolbar,
  action,
}: {
  documentId: string;
  title: string;
  /** Пункты меню «…». */
  actions: MenuEntry[];
  /** Какая сторона материала открыта — она подсвечена в ленте вкладок. */
  tab: MaterialTab;
  /** Панель значков под лентой. Своя у листа и у таблицы. */
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
  return (
    <header className="shrink-0 border-b border-[var(--line)] bg-[var(--surface)]">
      <div className="flex h-12 items-center gap-1 border-b border-[var(--line)] px-3">
        <h1 className="flex min-w-0 max-w-[32ch] shrink items-center gap-1 text-sm font-medium">
          <Link
            to="/documents"
            className="shrink-0 text-[var(--text-muted)] transition-colors hover:text-[var(--text)] hover:underline"
          >
            Документы
          </Link>
          <ChevronRight size={14} aria-hidden className="shrink-0 text-[var(--text-muted)]" />
          <span className="truncate" title={title}>
            {title}
          </span>
        </h1>

        <span aria-hidden className="mx-2 h-5 w-px shrink-0 bg-[var(--line)]" />

        {/* Лента прокручивается внутри себя: страница вбок не едет даже
            тогда, когда шесть вкладок в ширину не помещаются. */}
        <nav
          aria-label="Стороны материала"
          className="flex min-w-0 flex-1 items-stretch gap-0.5 self-stretch overflow-x-auto"
        >
          {MATERIAL_TABS.map((item) => (
            <SpineTab
              key={item.id}
              to={materialTabPath(documentId, item.id)}
              active={item.id === tab}
            >
              {item.label}
            </SpineTab>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-1 pl-2">
          <FieldsButton />
          {action ?? (
            <Link
              to={workspacePath(documentId)}
              title="Отметить получателей и выпустить документы"
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-[var(--accent)] px-3 text-sm font-medium text-[var(--accent-contrast)] transition-colors hover:bg-[var(--accent-hover)]"
            >
              <CheckCheck size={15} />
              Выпустить
            </Link>
          )}
          <Menu
            trigger={({ open, toggle }) => (
              <IconButton label="Ещё действия" aria-expanded={open} onClick={toggle} size="sm" className="size-9">
                <MoreHorizontal size={18} />
              </IconButton>
            )}
          >
            {actions.map((entry, i) =>
              entry.separator ? (
                <MenuDivider key={i} />
              ) : (
                <MenuItem
                  key={i}
                  icon={<span className="grid w-4 place-items-center text-[var(--text-muted)]">{entry.icon}</span>}
                  disabled={entry.disabled}
                  danger={entry.danger}
                  onClick={entry.onSelect}
                >
                  <span className="flex-1 whitespace-nowrap">{entry.label}</span>
                  {entry.shortcut && (
                    <span className="shrink-0 text-xs text-[var(--text-muted)]">{entry.shortcut}</span>
                  )}
                </MenuItem>
              ),
            )}
          </Menu>
        </div>
      </div>

      {toolbar && (
        <div className="flex flex-wrap items-center gap-1 px-2 py-1" role="toolbar">
          {toolbar}
        </div>
      )}
    </header>
  );
}

/**
 * «Поля» — с подписью, а не одним значком.
 *
 * Кнопка стоит на каждой вкладке и должна читаться с первого взгляда:
 * значок `{x}` без слова опознаёт только тот, кто уже знает, что за ним.
 * Панель одна на весь материал, поэтому и состояние общее — открытая
 * на листе, она остаётся открытой в письме.
 */
function FieldsButton() {
  const open = useFieldsPanelOpen();
  return (
    <button
      type="button"
      aria-pressed={open}
      onClick={toggleFieldsPanel}
      className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors ${
        open
          ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
          : 'text-[var(--text-muted)] hover:bg-[var(--row-hover)] hover:text-[var(--text)]'
      }`}
    >
      <Variable size={16} strokeWidth={1.75} />
      Поля
    </button>
  );
}

/**
 * Вкладка хребта.
 *
 * Ссылка, а не кнопка: у каждой стороны материала свой адрес, и его надо
 * уметь открыть в соседней вкладке браузера и послать коллеге.
 */
function SpineTab({ to, active, children }: { to: string; active: boolean; children: ReactNode }) {
  return (
    <Link
      to={to}
      aria-current={active ? 'page' : undefined}
      className={`-mb-px inline-flex shrink-0 items-center whitespace-nowrap border-b-2 px-2.5 text-sm transition-colors ${
        active
          ? 'border-[var(--accent)] font-medium text-[var(--accent)]'
          : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
      }`}
    >
      {children}
    </Link>
  );
}

/** Значок на панели: квадратная кнопка без подписи. */
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
    <IconButton size="sm" label={title} active={active} disabled={disabled} onClick={onClick}>
      {children}
    </IconButton>
  );
}

/** Черта между смысловыми группами значков. */
export function ToolDivider() {
  return <span aria-hidden className="mx-1 h-5 w-px bg-[var(--line)]" />;
}
