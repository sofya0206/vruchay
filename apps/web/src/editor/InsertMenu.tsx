import { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Circle,
  Image as ImageIcon,
  Link2,
  Minus,
  Plus,
  QrCode,
  Square,
  Type,
} from 'lucide-react';
import type { FieldInfo } from './fields';

export type InsertKind =
  | { type: 'text'; field?: FieldInfo }
  | { type: 'qr' }
  | { type: 'link' }
  | { type: 'shape'; kind: 'rect' | 'ellipse' | 'line' };

/**
 * Меню «Вставить» вместо отдельной кнопки на каждый тип блока.
 *
 * Кнопка «Текст» рядом с кнопкой «Фон» читалась как выбор из двух, хотя
 * на лист можно положить ещё QR-код, ссылку и фигуры. Собранные в одном
 * месте, они видны все сразу — и это ровно та связка, которую человек
 * знает по любому текстовому редактору.
 */
export function InsertMenu({
  onInsert,
  fields = [],
  onBackground,
  backgroundLoading = false,
  hasBackground = false,
  iconOnly = false,
}: {
  onInsert: (what: InsertKind) => void;
  /** Что можно подставить: колонки таблицы и то, что подставляет сервис. */
  fields?: FieldInfo[];
  /** Выбор файла бланка. Открывается системным окном, поэтому не onInsert. */
  onBackground: () => void;
  /** Загружается ли бланк прямо сейчас. */
  backgroundLoading?: boolean;
  /** Есть ли уже бланк: от этого зависит подсказка первого шага. */
  hasBackground?: boolean;
  /**
   * Значком без подписи — для панели под меню.
   *
   * Подпись там лишняя: слово «Вставить» уже стоит в строке меню, а панель
   * рассчитана на значки одного размера.
   */
  iconOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [submenu, setSubmenu] = useState<'text' | 'shape' | null>(null);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) {
        setOpen(false);
        setSubmenu(null);
      }
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Первый Escape закрывает подменю, второй — всё меню: иначе один
      // промах по клавише выбрасывал бы из обоих уровней сразу.
      if (submenu) setSubmenu(null);
      else setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open, submenu]);

  const pick = (what: InsertKind) => {
    setOpen(false);
    setSubmenu(null);
    onInsert(what);
  };

  const columns = fields.filter((f) => f.kind === 'column');
  const system = fields.filter((f) => f.kind === 'system');

  return (
    <div ref={wrap} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        title={iconOnly ? 'Вставить блок' : undefined}
        aria-label={iconOnly ? 'Вставить блок' : undefined}
        className={
          iconOnly
            ? `grid h-8 w-8 place-items-center rounded-lg transition-colors ${
                open
                  ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
                  : 'text-[var(--text-muted)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text)]'
              }`
            : 'inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-2.5 py-1.5 text-sm text-white transition-opacity hover:opacity-90'
        }
      >
        <Plus size={iconOnly ? 16 : 15} />
        {!iconOnly && (
          <>
            Вставить
            <ChevronDown size={14} />
          </>
        )}
      </button>

      {open && (
        <div
          role="menu"
          // Без overflow-hidden: подменю выезжает вправо за границу меню,
          // и обрезка съедала бы его целиком.
          className="absolute left-0 top-full z-20 mt-1 w-72 rounded-xl bg-[var(--surface)] py-1 shadow-lg ring-1 ring-[var(--line)]"
        >
          {/* Бланк первым: это первый шаг работы. */}
          <Item
            icon={<ImageIcon size={15} />}
            label={backgroundLoading ? 'Загружаем бланк…' : hasBackground ? 'Заменить бланк' : 'Бланк'}
            hint={hasBackground ? 'Другая картинка вместо нынешней' : 'С этого начинают: картинка вашей грамоты'}
            disabled={backgroundLoading}
            onClick={() => {
              setOpen(false);
              onBackground();
            }}
          />

          <div className="my-1 border-t border-[var(--line)]" />

          {/* У текста третий уровень: сразу вставить блок с нужным полем.
              Человек, размечающий грамоту, думает не «положу текст, потом
              впишу поле», а «сюда пойдёт имя». */}
          <div className="relative">
            <Item
              icon={<Type size={15} />}
              label="Текст"
              hint="Имя, звание, дата — с подстановкой из таблицы"
              submenu={submenu === 'text'}
              onClick={() => setSubmenu((v) => (v === 'text' ? null : 'text'))}
              onHover={() => setSubmenu('text')}
            />
            {submenu === 'text' && (
              <Sub>
                {columns.length > 0 && (
                  <>
                    <p className="px-3 py-1.5 text-xs text-[var(--text-muted)]">Подставится из таблицы</p>
                    {columns.map((f) => (
                      <SubItem key={f.source} title={f.title} hint={f.hint} onClick={() => pick({ type: 'text', field: f })} />
                    ))}
                    <div className="my-1 border-t border-[var(--line)]" />
                  </>
                )}
                <p className="px-3 py-1.5 text-xs text-[var(--text-muted)]">Подставит сервис</p>
                {system.map((f) => (
                  <SubItem key={f.source} title={f.title} hint={f.hint} onClick={() => pick({ type: 'text', field: f })} />
                ))}
                <div className="my-1 border-t border-[var(--line)]" />
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => pick({ type: 'text' })}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-[var(--surface-sunken)]"
                >
                  Просто текст, без подстановки
                </button>
              </Sub>
            )}
          </div>

          <Item
            icon={<QrCode size={15} />}
            label="QR-код"
            hint="Ссылка на проверку подлинности документа"
            onClick={() => pick({ type: 'qr' })}
          />
          <Item
            icon={<Link2 size={15} />}
            label="Ссылка"
            hint="Кликабельный адрес в PDF"
            onClick={() => pick({ type: 'link' })}
          />

          <div className="relative">
            <Item
              icon={<Square size={15} />}
              label="Фигура"
              hint="Линия, рамка, подложка под текст"
              submenu={submenu === 'shape'}
              onClick={() => setSubmenu((v) => (v === 'shape' ? null : 'shape'))}
              onHover={() => setSubmenu('shape')}
            />
            {submenu === 'shape' && (
              <Sub>
                <SubItem icon={<Minus size={14} />} title="Линия" hint="под подпись" onClick={() => pick({ type: 'shape', kind: 'line' })} />
                <SubItem icon={<Square size={14} />} title="Прямоугольник" hint="рамка или подложка" onClick={() => pick({ type: 'shape', kind: 'rect' })} />
                <SubItem icon={<Circle size={14} />} title="Овал" hint="печать, медальон" onClick={() => pick({ type: 'shape', kind: 'ellipse' })} />
              </Sub>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Item({
  icon,
  label,
  hint,
  onClick,
  onHover,
  submenu,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  hint: string;
  onClick: () => void;
  onHover?: () => void;
  submenu?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      aria-haspopup={onHover ? 'menu' : undefined}
      aria-expanded={onHover ? submenu : undefined}
      onClick={onClick}
      onMouseEnter={onHover}
      className="flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-[var(--surface-sunken)] disabled:opacity-50"
    >
      <span className="mt-0.5 text-[var(--text-muted)]">{icon}</span>
      <span className="flex-1">
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-[var(--text-muted)]">{hint}</span>
      </span>
      {onHover && <ChevronRight size={14} className="mt-1 text-[var(--text-muted)]" />}
    </button>
  );
}

function Sub({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="menu"
      className="absolute left-full top-0 z-30 ml-1 max-h-96 w-64 overflow-auto rounded-xl bg-[var(--surface)] py-1 shadow-lg ring-1 ring-[var(--line)]"
    >
      {children}
    </div>
  );
}

function SubItem({
  icon,
  title,
  hint,
  onClick,
}: {
  icon?: React.ReactNode;
  title: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      title={hint}
      onClick={onClick}
      className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[var(--surface-sunken)]"
    >
      {icon && <span className="text-[var(--text-muted)]">{icon}</span>}
      <span className="min-w-0 flex-1 truncate text-sm">{title}</span>
      <span className="shrink-0 text-xs text-[var(--text-muted)]">{hint}</span>
    </button>
  );
}
