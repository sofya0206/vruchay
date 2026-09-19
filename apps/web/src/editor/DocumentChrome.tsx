import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CheckCheck, ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react';
import { MATERIAL_TABS, materialTabPath, workspacePath, type MaterialTab } from '../mailing/workspace-tabs';
import { IconButton } from '../ui/IconButton';
import { Menu, MenuDivider, MenuItem } from '../ui/Menu';

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
      {/* На телефоне строка переносится: путь и действия сверху, лента
          вкладок — второй строкой во всю ширину. В одну строку лента
          сжималась до нуля, и из листа нельзя было попасть в таблицу. */}
      <div className="flex flex-wrap items-center gap-1 border-b border-[var(--line)] px-3 max-md:pt-1 md:h-12 md:flex-nowrap">
        <h1 className="flex min-w-0 items-center gap-1 text-sm font-medium max-md:flex-1 md:max-w-[32ch] md:shrink">
          {/* На телефоне вместо слова — стрелка под палец: слово «Документы»
              съедало половину строки у названия. */}
          <Link
            to="/documents"
            aria-label="К документам"
            className="-ml-2 grid size-11 shrink-0 place-items-center rounded-lg text-[var(--text-muted)] active:bg-[var(--surface-sunken)] md:hidden"
          >
            <ChevronLeft size={22} />
          </Link>
          <Link
            to="/documents"
            className="shrink-0 text-[var(--text-muted)] transition-colors hover:text-[var(--text)] hover:underline max-md:hidden"
          >
            Документы
          </Link>
          <ChevronRight size={14} aria-hidden className="shrink-0 text-[var(--text-muted)] max-md:hidden" />
          <span className="truncate max-md:text-base" title={title}>
            {title}
          </span>
        </h1>

        <span aria-hidden className="mx-2 h-5 w-px shrink-0 bg-[var(--line)] max-md:hidden" />

        {/* Лента прокручивается внутри себя: страница вбок не едет даже
            тогда, когда шесть вкладок в ширину не помещаются. */}
        <nav
          aria-label="Стороны материала"
          className="flex min-w-0 flex-1 items-stretch gap-0.5 self-stretch overflow-x-auto max-md:order-last max-md:h-11 max-md:basis-full"
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
          {action ?? (
            <Link
              to={workspacePath(documentId)}
              aria-label="Выпустить: отметить получателей и выпустить документы"
              className="inline-flex h-11 items-center gap-2 rounded-lg bg-[var(--accent)] px-3 text-sm font-medium text-[var(--accent-contrast)] transition-colors hover:bg-[var(--accent-hover)] md:h-9"
            >
              <CheckCheck size={15} />
              Выпустить
            </Link>
          )}
          <Menu
            trigger={({ open, toggle }) => (
              <IconButton label="Ещё действия" aria-expanded={open} onClick={toggle} size="sm" className="size-11 md:size-9">
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
                    // Горячие клавиши на сенсорном экране ни к чему — клавиатуры нет.
                    <span className="shrink-0 text-xs text-[var(--text-muted)] pointer-coarse:hidden">{entry.shortcut}</span>
                  )}
                </MenuItem>
              ),
            )}
          </Menu>
        </div>
      </div>

      {/* На телефоне панель в одну строку с прокруткой, а не в три строки
          переносами: иначе она съедала треть экрана у листа. */}
      {toolbar && (
        <div
          className="flex items-center gap-1 px-2 py-1 max-md:overflow-x-auto md:flex-wrap"
          role="toolbar"
        >
          {toolbar}
        </div>
      )}
    </header>
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
