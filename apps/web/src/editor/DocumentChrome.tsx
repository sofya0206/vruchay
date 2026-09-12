import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCheck } from 'lucide-react';
import { MATERIAL_TABS, materialTabPath, workspacePath, type MaterialTab } from '../mailing/workspace-tabs';
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
  const navigate = useNavigate();

  return (
    <header className="shrink-0 border-b border-[var(--line)] bg-[var(--surface)]">
      <div className="flex h-11 items-center gap-1 border-b border-[var(--line)] px-2">
        {/* Назад — здесь, в строке материала, а не отдельной строкой под
            шапкой кабинета: та строка над лентой вкладок стояла пустой
            и только отнимала высоту у листа. Шаг по своим следам, как
            и везде в кабинете; Esc тут не назначен — в редакторе у него
            своя работа. */}
        <button
          type="button"
          onClick={() => navigate(-1)}
          title="Назад"
          aria-label="Назад"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text)]"
        >
          <ArrowLeft size={19} />
        </button>

        {/* Название — коротко и с подсказкой: в ряду с шестью вкладками
            крупному заголовку места нет, а материал всё равно надо назвать. */}
        <h1 className="min-w-0 max-w-[26ch] shrink truncate px-1 text-sm font-medium" title={title}>
          {title}
        </h1>

        <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-[var(--line)]" />

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

        <div className="shrink-0 pl-2">
          {action ?? (
            <Link
              to={workspacePath(documentId)}
              title="Отметить получателей и выпустить документы"
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-2.5 py-1.5 text-sm font-medium text-[var(--accent-contrast)] transition-colors hover:bg-[var(--accent-hover)]"
            >
              <CheckCheck size={15} />
              Выпустить
            </Link>
          )}
        </div>
      </div>

      {/* Меню и панель значков — одной строкой, а не двумя: каждая лишняя
          строка в рамке отнимается у листа. */}
      <div className="flex flex-wrap items-center gap-1 px-2 py-1">
        <MenuBar menus={menus} />
        {toolbar && (
          <>
            <ToolDivider />
            <div className="flex flex-1 flex-wrap items-center gap-1" role="toolbar">
              {toolbar}
            </div>
          </>
        )}
      </div>
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
