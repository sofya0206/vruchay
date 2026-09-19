import { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Link2,
  Plus,
  QrCode,
  Type,
} from 'lucide-react';
import type { FieldInfo } from './fields';
import { BottomSheet } from '../ui/BottomSheet';

export type InsertKind =
  | { type: 'text'; field?: FieldInfo }
  | { type: 'qr' }
  | { type: 'link' }
  | { type: 'shape'; kind: 'rect' | 'ellipse' | 'line' };

/**
 * Меню «Вставить» вместо отдельной кнопки на каждый тип блока.
 *
 * Кнопка «Текст» рядом с кнопкой «Фон» читалась как выбор из двух, хотя
 * на лист можно положить ещё картинку, QR-код, ссылку и фигуры. Собранные в одном
 * месте, они видны все сразу — и это ровно та связка, которую человек
 * знает по любому текстовому редактору.
 */
export function InsertMenu({
  onInsert,
  fields = [],
  iconOnly = false,
}: {
  onInsert: (what: InsertKind) => void;
  /** Что можно подставить: колонки таблицы и то, что подставляет сервис. */
  fields?: FieldInfo[];
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
    const close = (e: PointerEvent) => {
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
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', close);
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
        title={iconOnly ? 'Вставить' : undefined}
        aria-label={iconOnly ? 'Вставить' : undefined}
        className={
          iconOnly
            ? `grid h-8 w-8 place-items-center rounded-lg transition-colors ${
                open
                  ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
                  : 'text-[var(--text-muted)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text)]'
              }`
            : 'inline-flex items-center gap-2 rounded-lg bg-[var(--accent-button)] px-2.5 py-1.5 text-sm text-[var(--accent-contrast)] transition-opacity hover:opacity-90'
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
          {/* Бланка здесь нет: у него свой значок в панели рядом с «+».
              Меню — про то, что кладут поверх бланка. */}
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

          {/* Картинки и бланка здесь нет: оба — файлы, их значки стоят
              в панели рядом с «+». Меню — про то, что рисуется на листе. */}
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

          {/* Фигуры — значком в панели рядом с «+»: они нужны в любой
              момент раскладки, а не только при первой вставке. */}
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
      // Наведение — только мышью. Касание на планшете присылает эмуляцию
      // наведения прямо перед нажатием, и подменю открывалось, а нажатие
      // тут же его закрывало.
      onPointerEnter={(e) => e.pointerType === 'mouse' && onHover?.()}
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
      onClick={onClick}
      className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[var(--surface-sunken)]"
    >
      {icon && <span className="text-[var(--text-muted)]">{icon}</span>}
      <span className="min-w-0 flex-1 truncate text-sm">{title}</span>
      <span className="shrink-0 text-xs text-[var(--text-muted)]">{hint}</span>
    </button>
  );
}

/**
 * То же меню «Вставить» нижним листом — для телефона.
 *
 * Вложенные списки здесь раскрываются на месте, а не вылетают вправо:
 * на экране в 375 точек справа от списка шириной 288 места нет, и второй
 * уровень уходил бы за край. Наведения на телефоне тоже нет — раскрытие
 * только нажатием.
 */
export function InsertSheet({
  open,
  onClose,
  onInsert,
  fields = [],
  onBackground,
  backgroundLoading = false,
  hasBackground = false,
}: {
  open: boolean;
  onClose: () => void;
  onInsert: (what: InsertKind) => void;
  fields?: FieldInfo[];
  onBackground: () => void;
  backgroundLoading?: boolean;
  hasBackground?: boolean;
}) {
  const [submenu, setSubmenu] = useState<'text' | 'shape' | null>(null);
  const pick = (what: InsertKind) => {
    onInsert(what);
    setSubmenu(null);
    onClose();
  };
  const columns = fields.filter((f) => f.kind === 'column');
  const system = fields.filter((f) => f.kind === 'system');
  const row =
    'flex min-h-14 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left active:bg-[var(--surface-sunken)] disabled:opacity-50';
  const sub = 'flex min-h-12 w-full items-center gap-3 rounded-lg py-2 pr-3 pl-11 text-left active:bg-[var(--surface-sunken)]';
  const head = (icon: React.ReactNode, label: string, hint: string, extra?: React.ReactNode) => (
    <>
      <span className="text-[var(--text-muted)]">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-base font-medium">{label}</span>
        <span className="block text-sm text-[var(--text-muted)]">{hint}</span>
      </span>
      {extra}
    </>
  );
  const chevron = (on: boolean) => (
    <ChevronDown size={18} className={`text-[var(--text-muted)] transition-transform ${on ? 'rotate-180' : ''}`} />
  );

  return (
    <BottomSheet open={open} onClose={onClose} title="Вставить на лист">
      <div role="menu" aria-label="Вставить на лист">
        <button
          type="button"
          role="menuitem"
          disabled={backgroundLoading}
          onClick={() => {
            onClose();
            onBackground();
          }}
          className={row}
        >
          {head(
            <ImageIcon size={20} />,
            backgroundLoading ? 'Загружаем бланк…' : hasBackground ? 'Заменить бланк' : 'Бланк',
            hasBackground ? 'Другая картинка вместо нынешней' : 'Фото или скан вашей грамоты',
          )}
        </button>

        <button
          type="button"
          aria-expanded={submenu === 'text'}
          onClick={() => setSubmenu((v) => (v === 'text' ? null : 'text'))}
          className={row}
        >
          {head(<Type size={20} />, 'Текст', 'Имя, звание, дата — из таблицы', chevron(submenu === 'text'))}
        </button>
        {submenu === 'text' && (
          <div className="pb-2">
            {[...columns, ...system].map((f) => (
              <button
                key={f.source}
                type="button"
                role="menuitem"
                onClick={() => pick({ type: 'text', field: f })}
                className={sub}
              >
                <span className="min-w-0 flex-1 truncate text-base">{f.title}</span>
                <span className="shrink-0 text-sm text-[var(--text-muted)]">
                  {f.kind === 'column' ? 'из таблицы' : 'подставит сервис'}
                </span>
              </button>
            ))}
            <button type="button" role="menuitem" onClick={() => pick({ type: 'text' })} className={sub}>
              <span className="text-base">Просто текст, без подстановки</span>
            </button>
          </div>
        )}

        <button type="button" role="menuitem" onClick={() => pick({ type: 'qr' })} className={row}>
          {head(<QrCode size={20} />, 'QR-код', 'Ведёт на проверку подлинности')}
        </button>
        <button type="button" role="menuitem" onClick={() => pick({ type: 'link' })} className={row}>
          {head(<Link2 size={20} />, 'Ссылка', 'Кликабельный адрес в PDF')}
        </button>

        <button
          type="button"
          aria-expanded={submenu === 'shape'}
          onClick={() => setSubmenu((v) => (v === 'shape' ? null : 'shape'))}
          className={row}
        >
          {head(<Square size={20} />, 'Фигура', 'Линия, рамка, подложка', chevron(submenu === 'shape'))}
        </button>
        {submenu === 'shape' && (
          <div className="pb-2">
            <button type="button" role="menuitem" onClick={() => pick({ type: 'shape', kind: 'line' })} className={sub}>
              <Minus size={16} className="text-[var(--text-muted)]" />
              <span className="text-base">Линия под подпись</span>
            </button>
            <button type="button" role="menuitem" onClick={() => pick({ type: 'shape', kind: 'rect' })} className={sub}>
              <Square size={16} className="text-[var(--text-muted)]" />
              <span className="text-base">Прямоугольник</span>
            </button>
            <button type="button" role="menuitem" onClick={() => pick({ type: 'shape', kind: 'ellipse' })} className={sub}>
              <Circle size={16} className="text-[var(--text-muted)]" />
              <span className="text-base">Овал</span>
            </button>
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
