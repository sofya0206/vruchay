import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  ChevronLeft,
  FilePlus2,
  FileText,
  LayoutTemplate,
  MoreHorizontal,
} from 'lucide-react';
import {
  MATERIAL_STEPS,
  materialPath,
  stepIndex,
  stepOfView,
  type MaterialView,
} from '../documents/material-steps';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { Menu, MenuDivider, MenuItem } from '../ui/Menu';
import { Stepper, type StepItem } from '../ui/Stepper';
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
 * Рамка документа: путь, лента шагов, главное действие и меню «…».
 *
 * Одна на все шаги. Лист, получатели, проверка, письмо и выпуск — не
 * разные разделы, а один документ на разных шагах: при переходе меняется
 * только содержимое под рамкой. Шаги идут в одном порядке
 * (documents/material-steps.ts), и лента говорит, где человек сейчас.
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
  view,
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
  /** Какой шаг документа открыт — он подсвечен в ленте шагов. */
  view: MaterialView;
  /** Панель значков под лентой. Своя у листа и у таблицы. */
  toolbar?: ReactNode;
  /**
   * Главное действие в рамке. По умолчанию — «Выпуск», ведущий на шаг
   * выпуска: место главного действия не должно переезжать от шага к шагу.
   * `null` — ничего: на самом шаге выпуска кнопка стоит в теле страницы.
   */
  action?: ReactNode;
  /**
   * Действия в строке названия — только на телефоне. Туда встаёт отмена
   * с повтором: отдельная строка панели ради двух значков съедала высоту
   * у листа.
   */
  titleActions?: ReactNode;
}) {
  const current = stepOfView(view);
  const at = stepIndex(current);
  const steps: StepItem[] = MATERIAL_STEPS.map((step, i) => ({
    id: step.id,
    label: step.label,
    to: materialPath(documentId, step.id),
    state: i < at ? 'done' : i === at ? 'current' : 'todo',
  }));

  return (
    <header className="shrink-0 border-b border-line bg-surface">
      {/* В узком окне строка переносится: название и действия сверху, лента
          шагов — второй строкой во всю ширину. В одну строку лента
          сжималась до нуля, и из листа нельзя было попасть в таблицу.
          Порог — 1280, а не 768: пяти подписям со связками нужно около
          570 точек, и рядом с названием, разделителем и «Выпуском» они
          помещаются только начиная с этой ширины — даже развёрнутой
          колонкой разделов. */}
      <div className="flex flex-wrap items-center gap-1 px-3 max-xl:pt-1 xl:h-12 xl:flex-nowrap xl:border-b xl:border-line">
        <h1 className="flex min-w-0 items-center gap-1 text-sm font-medium max-xl:flex-1 xl:max-w-[32ch] xl:shrink">
          {/* На телефоне — стрелка под палец вместо значка библиотеки. */}
          <Link
            to={isTemplate ? '/documents/templates' : '/documents'}
            aria-label={isTemplate ? 'Все шаблоны' : 'Все документы'}
            className="-ml-2 grid size-11 shrink-0 place-items-center rounded-control text-muted active:bg-sunken md:hidden"
          >
            <ChevronLeft size={24} />
          </Link>
          <span className="max-md:hidden">
            <LibraryLink isTemplate={isTemplate} />
          </span>
          <DocumentTitle documentId={documentId} title={title} />
        </h1>

        {/* Разделитель нужен только когда лента стоит в той же строке. */}
        <span aria-hidden className="mx-2 h-5 w-px shrink-0 bg-line max-xl:hidden" />

        <div className="min-w-0 flex-1 max-xl:order-last max-xl:basis-full" data-tour="stepper">
          <Stepper steps={steps} />
        </div>

        {titleActions && <div className="flex shrink-0 items-center md:hidden">{titleActions}</div>}

        {/* На телефоне «Выпуск» живёт внизу вкладки «Получатели», в шапке
            он не помещается рядом с названием. */}
        <div className="flex shrink-0 items-center gap-1 pl-2 [&>a:first-child]:max-md:hidden [&>button:first-child]:max-md:hidden">
          {isTemplate ? (
            <Button variant="primary" size="sm" to={`/documents?new=1&template=${documentId}`} icon={<FilePlus2 size={16} />}>
              Документ по шаблону
            </Button>
          ) : action === undefined ? (
            <Button
              variant="primary"
              size="sm"
              to={materialPath(documentId, 'issue')}
              title="К выпуску: отметить получателей и выпустить"
              data-tour="issue"
            >
              Выпуск
            </Button>
          ) : (
            action
          )}
          <Menu
            trigger={({ open, toggle }) => (
              <IconButton label="Ещё действия" aria-expanded={open} onClick={toggle}>
                <MoreHorizontal size={20} />
              </IconButton>
            )}
          >
            {actions.map((entry, i) =>
              entry.separator ? (
                <MenuDivider key={i} />
              ) : (
                <MenuItem
                  key={i}
                  icon={<span className="grid w-4 place-items-center text-muted">{entry.icon}</span>}
                  disabled={entry.disabled}
                  danger={entry.danger}
                  shortcut={entry.shortcut}
                  onClick={entry.onSelect}
                >
                  {entry.label}
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
      className="pressable grid size-8 shrink-0 place-items-center rounded-control text-muted hover:bg-sunken hover:text-ink"
      {...triggerProps}
    >
      <Icon size={16} strokeWidth={1.75} />
      {tooltip}
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
  return <span aria-hidden className="mx-1 h-5 w-px bg-line" />;
}
