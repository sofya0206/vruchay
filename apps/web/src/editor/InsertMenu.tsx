import { useEffect, useRef, useState, type ReactNode } from 'react';
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
import { BottomSheet } from '../ui/BottomSheet';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { MenuDivider, MenuItem, MenuLabel } from '../ui/Menu';

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
      {iconOnly ? (
        <IconButton
          size="sm"
          label="Вставить"
          active={open}
          aria-expanded={open}
          aria-haspopup="menu"
          data-tour="insert"
          onClick={() => setOpen((v) => !v)}
        >
          <Plus size={16} />
        </IconButton>
      ) : (
        <Button
          variant="primary"
          size="sm"
          icon={<Plus size={16} />}
          aria-expanded={open}
          aria-haspopup="menu"
          data-tour="insert"
          onClick={() => setOpen((v) => !v)}
        >
          Вставить
          <ChevronDown size={16} />
        </Button>
      )}

      {open && (
        <div
          role="menu"
          // Без overflow-hidden: подменю выезжает вправо за границу меню,
          // и обрезка съедала бы его целиком.
          className="absolute left-0 top-full z-20 mt-1 w-72 rounded-card bg-raised p-1.5 shadow-lg ring-1 ring-line"
        >
          {/* Бланка здесь нет: у него свой значок в панели рядом с «+».
              Меню — про то, что кладут поверх бланка. */}
          {/* У текста третий уровень: сразу вставить блок с нужным полем.
              Человек, размечающий грамоту, думает не «положу текст, потом
              впишу поле», а «сюда пойдёт имя». */}
          <div className="relative">
            <Item
              icon={<Type size={16} />}
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
                    <MenuLabel>Подставится из таблицы</MenuLabel>
                    {columns.map((f) => (
                      <SubItem key={f.source} title={f.title} hint={f.hint} onClick={() => pick({ type: 'text', field: f })} />
                    ))}
                    <MenuDivider />
                  </>
                )}
                <MenuLabel>Подставит сервис</MenuLabel>
                {system.map((f) => (
                  <SubItem key={f.source} title={f.title} hint={f.hint} onClick={() => pick({ type: 'text', field: f })} />
                ))}
                <MenuDivider />
                <MenuItem onClick={() => pick({ type: 'text' })}>Просто текст, без подстановки</MenuItem>
              </Sub>
            )}
          </div>

          {/* Картинки и бланка здесь нет: оба — файлы, их значки стоят
              в панели рядом с «+». Меню — про то, что рисуется на листе. */}
          <Item
            icon={<QrCode size={16} />}
            label="QR-код"
            hint="Ссылка на проверку подлинности документа"
            onClick={() => pick({ type: 'qr' })}
          />
          <Item
            icon={<Link2 size={16} />}
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

/** Пункт в две строки — название и что подставится; своя вёрстка, поэтому не `MenuItem`. */
function Item({
  icon,
  label,
  hint,
  onClick,
  onHover,
  submenu,
  disabled,
}: {
  icon: ReactNode;
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
      className="flex w-full items-start gap-3 rounded-control px-2.5 py-2 text-left transition-colors hover:bg-sunken disabled:opacity-50"
    >
      <span className="mt-0.5 text-muted">{icon}</span>
      <span className="flex-1">
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-muted">{hint}</span>
      </span>
      {onHover && <ChevronRight size={16} className="mt-1 text-muted" />}
    </button>
  );
}

function Sub({ children }: { children: ReactNode }) {
  return (
    <div
      role="menu"
      className="absolute left-full top-0 z-30 ml-1 max-h-96 w-64 overflow-auto rounded-card bg-raised p-1.5 shadow-lg ring-1 ring-line"
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
  icon?: ReactNode;
  title: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-control px-2.5 py-2 text-left transition-colors hover:bg-sunken"
    >
      {icon && <span className="text-muted">{icon}</span>}
      <span className="min-w-0 flex-1 truncate text-sm">{title}</span>
      <span className="shrink-0 text-xs text-muted">{hint}</span>
    </button>
  );
}

/**
 * То же меню «Вставить» нижним листом — для телефона.
 *
 * Вложенных списков нет: на экране в 375 точек второй уровень уходил бы
 * за край. Поля таблицы — фишками, редкое — плитками.
 */
export function InsertSheet({
  open,
  onClose,
  onInsert,
  fields = [],
  onBackground,
  onImage,
  backgroundLoading = false,
  hasBackground = false,
}: {
  open: boolean;
  onClose: () => void;
  onInsert: (what: InsertKind) => void;
  fields?: FieldInfo[];
  onBackground: () => void;
  onImage: () => void;
  backgroundLoading?: boolean;
  hasBackground?: boolean;
}) {
  const pick = (what: InsertKind) => {
    onInsert(what);
    onClose();
  };
  const columns = fields.filter((f) => f.kind === 'column');
  const system = fields.filter((f) => f.kind === 'system');
  const label = (text: string) => (
    <p className="px-5 pt-3.5 pb-2 text-xs font-medium tracking-wide text-muted uppercase">{text}</p>
  );
  const chips = (items: FieldInfo[]) => (
    <div className="flex flex-wrap gap-2 px-5 pb-1">
      {items.map((f) => (
        <Button
          key={f.source}
          role="menuitem"
          variant="secondary"
          icon={<Plus size={16} className="text-accent" />}
          onClick={() => pick({ type: 'text', field: f })}
        >
          {f.title}
        </Button>
      ))}
    </div>
  );
  const tile = (icon: ReactNode, title: string, hint: string, onClick: () => void, disabled = false) => (
    <Button
      role="menuitem"
      variant="secondary"
      disabled={disabled}
      onClick={() => {
        onClose();
        onClick();
      }}
      className="h-auto flex-col gap-1 px-1 py-3"
    >
      {icon}
      <span className="text-sm font-medium">{title}</span>
      <span className="-mt-1 text-xs text-muted">{hint}</span>
    </Button>
  );

  return (
    <BottomSheet open={open} onClose={onClose} title="Вставить на лист" className="h-[82vh]">
      <div role="menu" className="min-h-0 flex-1 overflow-y-auto pb-4">
        {label('Текст')}
        <div className="px-5 pb-1">
          <Button
            role="menuitem"
            variant="secondary"
            size="lg"
            icon={<Type size={20} className="text-muted" />}
            onClick={() => pick({ type: 'text' })}
            className="w-full justify-start gap-3 px-4"
          >
            Текстовый блок
            <span className="ml-auto text-sm font-normal text-muted">без подстановки</span>
          </Button>
        </div>
        {columns.length > 0 && (
          <>
            {label('Из таблицы получателей')}
            {chips(columns)}
          </>
        )}
        {label('Подставит сервис')}
        {chips(system)}
        {label('Ещё')}
        <div className="grid grid-cols-4 gap-2.5 px-5">
          {tile(<QrCode size={24} />, 'QR-код', 'проверка', () => onInsert({ type: 'qr' }))}
          {tile(<ImageIcon size={24} />, 'Картинка', 'логотип', onImage)}
          {tile(<Minus size={24} />, 'Линия', 'подпись', () => onInsert({ type: 'shape', kind: 'line' }))}
          {tile(<Square size={24} />, 'Фигура', 'рамка', () => onInsert({ type: 'shape', kind: 'rect' }))}
        </div>
        <div className="grid grid-cols-4 gap-2.5 px-5 pt-2.5">
          {tile(<Circle size={24} />, 'Овал', 'печать', () => onInsert({ type: 'shape', kind: 'ellipse' }))}
          {tile(<Link2 size={24} />, 'Ссылка', 'адрес', () => onInsert({ type: 'link' }))}
          {tile(<ImageIcon size={24} />, 'Бланк', hasBackground ? 'заменить' : 'фон листа', onBackground, backgroundLoading)}
        </div>
      </div>
    </BottomSheet>
  );
}
