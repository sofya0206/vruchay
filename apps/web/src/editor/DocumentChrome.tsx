import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, FilePlus2, FileText, LayoutTemplate, LoaderCircle, MoreHorizontal } from 'lucide-react';
import { MATERIAL_TABS, materialTabPath, workspacePath, type MaterialTab } from '../mailing/workspace-tabs';
import { IconButton } from '../ui/IconButton';
import { Menu, MenuDivider, MenuItem } from '../ui/Menu';
import { useTooltip } from '../ui/Tooltip';
import { DocumentTitle } from './DocumentTitle';

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
 * Значок библиотеки и название — и заголовок, и дорога назад: значок ведёт
 * в «Документы» (у шаблона — в «Шаблоны»), а не безымянной стрелкой
 * по истории браузера. Словом путь не пишем: «Документы ›» перед каждым
 * названием только оттесняло само название.
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
  isTemplate = false,
  titleActions,
}: {
  documentId: string;
  title: string;
  /**
   * Шаблон не выпускается: главное действие у него — новый документ
   * по нему, на том же месте, где у документа «Выпустить».
   */
  isTemplate?: boolean;
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
  /**
   * Действия в строке названия — только на телефоне. Туда встаёт отмена
   * с повтором: отдельная строка панели ради двух значков съедала высоту
   * у листа.
   */
  titleActions?: ReactNode;
}) {
  return (
    <header className="shrink-0 border-b border-[var(--line)] bg-[var(--surface)]">
      {/* На телефоне строка переносится: название и действия сверху, лента
          вкладок — второй строкой во всю ширину. В одну строку лента
          сжималась до нуля, и из листа нельзя было попасть в таблицу. */}
      <div className="flex flex-wrap items-center gap-1 px-3 max-md:pt-1 md:h-12 md:flex-nowrap md:border-b md:border-[var(--line)]">
        <h1 className="flex min-w-0 items-center gap-1 text-sm font-medium max-md:flex-1 md:max-w-[32ch] md:shrink">
          {/* На телефоне — стрелка под палец вместо значка библиотеки. */}
          <Link
            to={isTemplate ? '/documents/templates' : '/documents'}
            aria-label={isTemplate ? 'Все шаблоны' : 'Все документы'}
            className="-ml-2 grid size-11 shrink-0 place-items-center rounded-lg text-[var(--text-muted)] active:bg-[var(--surface-sunken)] md:hidden"
          >
            <ChevronLeft size={22} />
          </Link>
          <span className="max-md:hidden">
            <LibraryLink isTemplate={isTemplate} />
          </span>
          <DocumentTitle documentId={documentId} title={title} />
        </h1>

        <span aria-hidden className="mx-2 h-5 w-px shrink-0 bg-[var(--line)] max-md:hidden" />

        {/* Лента прокручивается внутри себя: страница вбок не едет даже
            тогда, когда шесть вкладок в ширину не помещаются. */}
        <nav
          aria-label="Стороны материала"
          className="no-scrollbar flex min-w-0 flex-1 items-stretch gap-0.5 self-stretch overflow-x-auto max-md:order-last max-md:h-11 max-md:basis-full"
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

        {titleActions && <div className="flex shrink-0 items-center md:hidden">{titleActions}</div>}

        {/* На телефоне «Выпуск» живёт внизу вкладки «Получатели», в шапке
            он не помещается рядом с названием. */}
        <div className="flex shrink-0 items-center gap-1 pl-2 [&>a:first-child]:max-md:hidden [&>button:first-child]:max-md:hidden">
          {isTemplate ? (
            <Link
              to={`/documents?new=1&template=${documentId}`}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-[var(--accent)] px-3 text-sm font-medium text-[var(--accent-contrast)] transition-colors hover:bg-[var(--accent-hover)]"
            >
              <FilePlus2 size={15} />
              Документ по шаблону
            </Link>
          ) : action ?? <ReleaseLink to={workspacePath(documentId)} />}
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
        <div className="flex items-center gap-1 px-2 py-1 max-md:overflow-x-auto md:flex-wrap" role="toolbar">
          {toolbar}
        </div>
      )}
    </header>
  );
}

/*
 * «Выпуск» — главное действие материала, одной формы на всех вкладках.
 * Нажатие чуть поджимает кнопку: без отклика она казалась нарисованной.
 */
const releaseClass =
  'inline-flex h-9 items-center gap-2 rounded-lg bg-[var(--accent-button)] px-3.5 text-sm font-medium text-[var(--accent-contrast)] transition-[background-color,scale] duration-150 hover:bg-[var(--accent-button-hover)] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100';

/**
 * Кнопка выпуска на списке получателей.
 *
 * Число отмеченных — плашкой внутри, а не хвостом слова: «Выпустить 12»
 * читалось как одна фраза, а счётчик должен читаться счётчиком.
 */
export function ReleaseButton({
  count,
  running,
  disabled,
  onClick,
}: {
  count: number;
  running: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className={releaseClass} disabled={disabled} onClick={onClick}>
      {running && <LoaderCircle size={15} className="animate-spin" />}
      {running ? 'Выпускаем' : 'Выпуск'}
      {!running && count > 0 && (
        <span className="tabular -mr-1 grid h-5 min-w-5 place-items-center rounded-md bg-[var(--accent-contrast)]/20 px-1.5 text-xs leading-none">
          {count}
        </span>
      )}
    </button>
  );
}

/** На остальных вкладках выпуск на том же месте, но ведёт к списку. */
function ReleaseLink({ to }: { to: string }) {
  const { triggerProps, tooltip } = useTooltip('Отметить получателей и выпустить');
  return (
    <Link to={to} className={releaseClass} {...triggerProps}>
      Выпуск
      {tooltip}
    </Link>
  );
}

/**
 * Дорога в библиотеку значком перед названием.
 *
 * Ссылка, а не кнопка: библиотеку открывают и в соседней вкладке браузера.
 * Подпись — в подсказке и для скринридера, на экране только значок.
 */
function LibraryLink({ isTemplate }: { isTemplate: boolean }) {
  const label = isTemplate ? 'Все шаблоны' : 'Все документы';
  const { triggerProps, tooltip } = useTooltip(label);
  const Icon = isTemplate ? LayoutTemplate : FileText;
  return (
    <Link
      to={isTemplate ? '/documents/templates' : '/documents'}
      aria-label={label}
      className="grid size-8 shrink-0 place-items-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text)]"
      {...triggerProps}
    >
      <Icon size={17} strokeWidth={1.75} />
      {tooltip}
    </Link>
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
      className={`-mb-px inline-flex shrink-0 items-center whitespace-nowrap border-b-2 px-2.5 text-sm transition-colors max-md:px-3 max-md:text-[15px] ${
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
