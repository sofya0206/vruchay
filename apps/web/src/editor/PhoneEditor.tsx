import { useState, type ReactNode } from 'react';
import type { Editor } from '@tiptap/core';
import { useEditorState } from '@tiptap/react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Bold,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsDown,
  ChevronsUp,
  ChevronUp,
  Copy,
  FileSliders,
  Image,
  Italic,
  Layers,
  ListChecks,
  Lock,
  LockOpen,
  Minus,
  MoreHorizontal,
  Move,
  Pencil,
  Plus,
  SlidersHorizontal,
  Trash2,
  Underline,
  Variable,
} from 'lucide-react';
import type { ResizeHandle } from './geometry';
import type { TextProps } from '@gramota/shared';
import type { FieldInfo } from './fields';
import type { AlignKind } from './selection';
import { FONTS } from './fonts-list';
import { BottomSheet } from '../ui/BottomSheet';
import { Button } from '../ui/Button';
import { Input } from '../ui/Field';
import { IconButton } from '../ui/IconButton';
import { MenuDivider, MenuItem } from '../ui/Menu';
import { Select } from '../ui/Select';
import { Segmented } from '../ui/Tabs';
import { cn } from '../ui/cn';

/*
 * Редактор листа на телефоне — по холсту «Вручай на телефоне» (19.09.2026).
 *
 * На десктопе всё, чем правят лист, стоит панелью значков сверху и колонкой
 * справа. На телефоне верх экрана большим пальцем не достать, а колонка
 * в 320 точек съедала бы весь лист. Поэтому здесь:
 *
 * — нижняя панель, которая меняется от того, выбран ли блок (как в Canva:
 *   без выбора — что добавить на лист, с выбором — что сделать с блоком);
 * — полулисты вместо колонки: свойства, слои, поля, положение;
 * — правка текста на месте с панелью оформления над клавиатурой;
 * — меню по долгому нажатию: «выбрать под», «выделить несколько».
 */

/*
 * На телефоне — без верхней и нижней середины. Строка текста на листе,
 * вписанном в ширину экрана, высотой пикселей 25, и ручки «n» и «s» с зоной
 * под палец накрыли бы её целиком: тянешь блок — хватаешь ручку.
 */
export const PHONE_HANDLES: ResizeHandle[] = ['nw', 'ne', 'e', 'se', 'sw', 'w'];

/**
 * Невидимая зона под палец вокруг ручки. Видимая ручка остаётся мелкой —
 * крупнее она закрывала бы узкий блок, — а попадать пальцем есть куда.
 * Мыши зона не нужна: там она перехватывала бы блок у соседних ручек.
 */
export function TouchZone() {
  return <span aria-hidden className="absolute -inset-3 hidden rounded-full pointer-coarse:block" />;
}

/** Кнопка нижней панели: значок и короткая подпись под ним. */
function BarButton({
  icon,
  label,
  onClick,
  active = false,
  disabled = false,
  danger = false,
  primary = false,
  badge,
  fixed = false,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  danger?: boolean;
  primary?: boolean;
  badge?: number;
  /** Постоянная ширина — для прокручиваемой ленты. */
  fixed?: boolean;
}) {
  return (
    <Button
      variant="ghost"
      size="lg"
      onClick={onClick}
      disabled={disabled}
      active={active || undefined}
      className={cn(
        'relative h-14 flex-col gap-0.5 px-0.5 text-[11px] leading-none',
        fixed ? 'w-[68px] shrink-0' : 'min-w-0 flex-1',
        danger && !active && 'text-danger hover:text-danger',
      )}
    >
      {/* Значок — в гнезде одной высоты у всех кнопок: иначе круглая «Вставить»
          сдвигала свою подпись ниже соседних. */}
      <span className="grid h-8 place-items-center">
        {primary ? (
          <span className="grid size-8 place-items-center rounded-full bg-accent-button text-on-accent">{icon}</span>
        ) : (
          icon
        )}
      </span>
      <span className="max-w-full truncate">{label}</span>
      {badge ? (
        <span className="absolute top-1.5 right-[calc(50%-22px)] grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-semibold leading-none text-on-accent">
          {badge}
        </span>
      ) : null}
    </Button>
  );
}

export type PhoneSheet = 'props' | 'layers' | 'fields' | 'position';

/**
 * Нижняя панель редактора на телефоне.
 *
 * Два набора в одном месте, а не две панели: палец всегда находит
 * инструменты там же, меняется только то, что к делу сейчас.
 */
export function PhoneToolbar({
  selectedCount,
  canEditText,
  locked,
  sheet,
  fieldsBadge,
  onInsert,
  onSheet,
  onBackground,
  backgroundBusy,
  onEditText,
  onDuplicate,
  onLock,
  onDelete,
}: {
  selectedCount: number;
  canEditText: boolean;
  locked: boolean;
  sheet: PhoneSheet | null;
  fieldsBadge?: number;
  onInsert: () => void;
  onSheet: (sheet: PhoneSheet) => void;
  onBackground: () => void;
  backgroundBusy: boolean;
  onEditText: () => void;
  onDuplicate: () => void;
  onLock: () => void;
  onDelete: () => void;
}) {
  const on = (s: PhoneSheet) => sheet === s;
  return (
    <div
      role="toolbar"
      aria-label={selectedCount ? 'Действия с блоком' : 'Инструменты листа'}
      className="flex shrink-0 gap-0.5 border-t border-line bg-surface px-1 pt-1 pb-[max(4px,env(safe-area-inset-bottom))]"
    >
      {selectedCount > 0 ? (
        // Лента прокручивается: пунктов больше, чем влезает в ширину.
        <div className="no-scrollbar flex min-w-0 flex-1 gap-0.5 overflow-x-auto">
          <BarButton fixed icon={<Pencil size={20} />} label="Изменить" disabled={!canEditText} onClick={onEditText} />
          <BarButton fixed icon={<SlidersHorizontal size={20} />} label="Свойства" active={on('props')} onClick={() => onSheet('props')} />
          <BarButton fixed icon={<Variable size={20} />} label="Поле" active={on('fields')} onClick={() => onSheet('fields')} />
          <BarButton fixed icon={<Move size={20} />} label="Положение" active={on('position')} disabled={locked} onClick={() => onSheet('position')} />
          <BarButton fixed icon={<Layers size={20} />} label="Слои" active={on('layers')} onClick={() => onSheet('layers')} />
          <BarButton fixed icon={<Copy size={20} />} label="Копия" onClick={onDuplicate} />
          <BarButton fixed icon={locked ? <Lock size={20} /> : <LockOpen size={20} />} label={locked ? 'Отпереть' : 'Замок'} active={locked} onClick={onLock} />
          <BarButton fixed icon={<Trash2 size={20} />} label="Удалить" danger onClick={onDelete} />
        </div>
      ) : (
        <>
          <BarButton icon={<Plus size={20} strokeWidth={2.25} />} label="Вставить" primary onClick={onInsert} />
          <BarButton icon={<Image size={20} />} label={backgroundBusy ? 'Грузим…' : 'Бланк'} disabled={backgroundBusy} onClick={onBackground} />
          <BarButton icon={<Variable size={20} />} label="Поля" active={on('fields')} badge={fieldsBadge} onClick={() => onSheet('fields')} />
          <BarButton icon={<Layers size={20} />} label="Слои" active={on('layers')} onClick={() => onSheet('layers')} />
          {/* Без выбранного блока «Свойства» показывают сам лист: мероприятие,
              формат, проверку по QR. Не «Лист» — так уже подписана кнопка
              добавления листа над панелью, и одно слово значило бы два дела. */}
          <BarButton icon={<FileSliders size={20} />} label="Свойства" active={on('props')} onClick={() => onSheet('props')} />
        </>
      )}
    </div>
  );
}

/** Плавающий переключатель «Заготовка / Данные» над листом. */
export function ViewPill({
  dataMode,
  rowCount,
  row,
  onMode,
  onRow,
}: {
  dataMode: boolean;
  rowCount: number;
  row: number;
  onMode: (mode: 'placeholders' | 'data') => void;
  onRow: (row: number) => void;
}) {
  return (
    <div className="pointer-events-auto absolute top-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-control bg-surface p-0.5 shadow-sm ring-1 ring-line">
      <Segmented
        label="На листе показывать"
        items={[
          { id: 'placeholders', label: 'Заготовка' },
          { id: 'data', label: 'Данные' },
        ]}
        value={dataMode ? 'data' : 'placeholders'}
        // Пустой список — данных показывать нечем: переключатель остаётся на заготовке.
        onChange={(mode) => {
          if (mode === 'data' && rowCount === 0) return;
          onMode(mode);
        }}
      />
      {dataMode && rowCount > 0 && (
        <span className="flex items-center border-l border-line pl-0.5 text-sm text-muted">
          <IconButton size="sm" label="Предыдущая строка" disabled={row === 0} onClick={() => onRow(Math.max(0, row - 1))}>
            <ChevronLeft size={16} />
          </IconButton>
          <span className="tabular min-w-9 text-center whitespace-nowrap">
            {row + 1}/{rowCount}
          </span>
          <IconButton
            size="sm"
            label="Следующая строка"
            disabled={row >= rowCount - 1}
            onClick={() => onRow(Math.min(rowCount - 1, row + 1))}
          >
            <ChevronRight size={16} />
          </IconButton>
        </span>
      )}
    </div>
  );
}

/**
 * Листы материала — плавающей пилюлей внизу холста, вместо ленты закладок.
 * Лист один — только «+ Лист»: стрелки в никуда и «1 из 1» были шумом.
 */
export function PagePill({
  index,
  count,
  onSelect,
  onAdd,
}: {
  index: number;
  count: number;
  onSelect: (index: number) => void;
  onAdd: () => void;
}) {
  const shell =
    'pointer-events-auto absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center rounded-full bg-surface p-0.5 shadow-sm ring-1 ring-line';
  if (count <= 1) {
    return (
      <div className={shell}>
        <Button variant="ghost" icon={<Plus size={16} />} onClick={onAdd}>
          Лист
        </Button>
      </div>
    );
  }
  return (
    <div className={shell}>
      <IconButton label="Предыдущий лист" disabled={index === 0} onClick={() => onSelect(index - 1)}>
        <ChevronLeft size={20} />
      </IconButton>
      <span className="tabular min-w-10 text-center text-sm font-medium whitespace-nowrap">
        {index + 1}/{count}
      </span>
      <IconButton label="Следующий лист" disabled={index >= count - 1} onClick={() => onSelect(index + 1)}>
        <ChevronRight size={20} />
      </IconButton>
      <span aria-hidden className="mx-0.5 h-4 w-px bg-line" />
      <IconButton label="Добавить лист" onClick={onAdd}>
        <Plus size={20} />
      </IconButton>
    </div>
  );
}

/** Мини-панель над выбранным блоком — как в Canva: копия, удалить, ещё. */
export function MiniBar({
  left,
  top,
  onDuplicate,
  onDelete,
  onMore,
}: {
  left: number;
  top: number;
  onDuplicate: () => void;
  onDelete: () => void;
  onMore: () => void;
}) {
  const b = (label: string, icon: ReactNode, onClick: () => void, danger = false) => (
    <IconButton
      label={label}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={onClick}
      className={danger ? 'text-danger hover:text-danger' : 'text-ink'}
    >
      {icon}
    </IconButton>
  );
  return (
    <div
      className="absolute z-20 flex gap-0.5 rounded-card bg-raised p-0.5 shadow-lg ring-1 ring-line"
      style={{ left, top, transform: 'translate(-50%, -100%)' }}
    >
      {b('Дублировать', <Copy size={20} />, onDuplicate)}
      {b('Удалить', <Trash2 size={20} />, onDelete, true)}
      {b('Ещё', <MoreHorizontal size={20} />, onMore)}
    </div>
  );
}

/**
 * Меню по долгому нажатию на блок.
 *
 * «Выбрать под» — ответ на главную боль Canva: блок, накрытый другим,
 * пальцем не достать. «Выделить несколько» — режим, в котором касания
 * добавляют к выделению, пока не нажать «Готово».
 */
export function ContextSheet({
  open,
  locked,
  canSelectBehind,
  onClose,
  onDuplicate,
  onMulti,
  onSelectBehind,
  onLock,
  onDelete,
}: {
  open: boolean;
  locked: boolean;
  canSelectBehind: boolean;
  onClose: () => void;
  onDuplicate: () => void;
  onMulti: () => void;
  onSelectBehind: () => void;
  onLock: () => void;
  onDelete: () => void;
}) {
  const row = (icon: ReactNode, label: string, onClick: () => void, opts: { danger?: boolean; disabled?: boolean } = {}) => (
    <MenuItem
      icon={<span className="text-muted">{icon}</span>}
      danger={opts.danger}
      disabled={opts.disabled}
      onClick={() => {
        onClose();
        onClick();
      }}
    >
      {label}
    </MenuItem>
  );
  return (
    <BottomSheet open={open} onClose={onClose} title="Блок">
      <div role="menu">
        {row(<Copy size={20} />, 'Дублировать', onDuplicate)}
        {row(<ListChecks size={20} />, 'Выделить несколько', onMulti)}
        {row(<Layers size={20} />, 'Выбрать под', onSelectBehind, { disabled: !canSelectBehind })}
        {row(locked ? <LockOpen size={20} /> : <Lock size={20} />, locked ? 'Отпереть' : 'Запереть', onLock)}
        <MenuDivider />
        {row(<Trash2 size={20} />, 'Удалить', onDelete, { danger: true })}
      </div>
    </BottomSheet>
  );
}

/** Шаги сдвига: миллиметр — подогнать, пять — переставить. */
type NudgeStep = 1 | 5;

/**
 * Полулист «Положение»: выровнять на листе, порядок слоёв, точный сдвиг
 * и числа в миллиметрах. Пальцем блок встаёт «примерно туда», а грамоте
 * нужно «ровно по центру линии».
 */
export function PositionSheet({
  open,
  onClose,
  box,
  onAlign,
  onLayer,
  onNudge,
  onBox,
}: {
  open: boolean;
  onClose: () => void;
  /** Единственный выбранный блок — иначе числа не показываем. */
  box: { x: number; y: number; w: number; h: number } | null;
  onAlign: (kind: AlignKind) => void;
  onLayer: (where: 'front' | 'up' | 'down' | 'back') => void;
  onNudge: (dxMm: number, dyMm: number) => void;
  onBox: (box: { x: number; y: number; w: number; h: number }) => void;
}) {
  const [step, setStep] = useState<NudgeStep>(1);
  const label = (text: string) => (
    <p className="px-1 pt-3 pb-2 text-xs font-medium tracking-wide text-muted uppercase">{text}</p>
  );
  const sq = (title: string, icon: ReactNode, onClick: () => void) => (
    <Button variant="secondary" size="lg" aria-label={title} onClick={onClick} className="flex-1 px-0">
      {icon}
    </Button>
  );
  // Глифы выравнивания: линия и два бруска, как в Keynote.
  const glyph = (kind: AlignKind) => {
    const g: Record<AlignKind, string> = {
      left: '<line x1="4" x2="4" y1="3" y2="21"/><rect x="7" y="6" width="10" height="4" rx="1"/><rect x="7" y="14" width="14" height="4" rx="1"/>',
      hcenter: '<line x1="12" x2="12" y1="3" y2="21"/><rect x="7" y="6" width="10" height="4" rx="1"/><rect x="5" y="14" width="14" height="4" rx="1"/>',
      right: '<line x1="20" x2="20" y1="3" y2="21"/><rect x="7" y="6" width="10" height="4" rx="1"/><rect x="3" y="14" width="14" height="4" rx="1"/>',
      top: '<line x1="3" x2="21" y1="4" y2="4"/><rect x="6" y="7" width="4" height="10" rx="1"/><rect x="14" y="7" width="4" height="14" rx="1"/>',
      vcenter: '<line x1="3" x2="21" y1="12" y2="12"/><rect x="6" y="7" width="4" height="10" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>',
      bottom: '<line x1="3" x2="21" y1="20" y2="20"/><rect x="6" y="7" width="4" height="10" rx="1"/><rect x="14" y="3" width="4" height="14" rx="1"/>',
    };
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden dangerouslySetInnerHTML={{ __html: g[kind] }} />
    );
  };
  const num = (key: 'x' | 'y' | 'w' | 'h', title: string) =>
    box && (
      <label className="flex flex-1 flex-col items-stretch gap-1">
        <span className="text-center text-xs tracking-wide text-muted uppercase">{title}</span>
        <Input
          type="number"
          inputMode="decimal"
          step={0.5}
          value={Math.round(box[key] * 10) / 10}
          onChange={(e) => {
            const value = Number(e.target.value);
            if (Number.isFinite(value)) onBox({ ...box, [key]: value });
          }}
          className="tabular h-11 px-1 text-center text-base"
        />
      </label>
    );
  return (
    <BottomSheet open={open} onClose={onClose} title="Положение">
      <div className="px-3 pb-4">
        {label('Выровнять на листе')}
        <div className="flex gap-2">
          {(['left', 'hcenter', 'right', 'top', 'vcenter', 'bottom'] as AlignKind[]).map((k) =>
            sq(
              { left: 'К левому краю', hcenter: 'По центру', right: 'К правому краю', top: 'К верху', vcenter: 'По середине', bottom: 'К низу' }[k],
              glyph(k),
              () => onAlign(k),
            ),
          )}
        </div>
        {label('Порядок слоёв')}
        <div className="flex gap-2">
          {sq('В самый верх', <ChevronsUp size={24} />, () => onLayer('front'))}
          {sq('Выше', <ChevronUp size={24} />, () => onLayer('up'))}
          {sq('Ниже', <ChevronDown size={24} />, () => onLayer('down'))}
          {sq('В самый низ', <ChevronsDown size={24} />, () => onLayer('back'))}
        </div>
        {label('Сдвинуть точно')}
        <div className="flex items-center gap-1.5">
          <div className="flex flex-1 gap-1.5 rounded-sheet bg-sunken p-1">
            {(
              [
                ['Влево', <ArrowLeft size={20} />, -1, 0],
                ['Вверх', <ArrowUp size={20} />, 0, -1],
                ['Вниз', <ArrowDown size={20} />, 0, 1],
                ['Вправо', <ArrowRight size={20} />, 1, 0],
              ] as [string, ReactNode, number, number][]
            ).map(([t, ic, dx, dy]) => (
              <Button key={t} variant="secondary" size="lg" aria-label={t} onClick={() => onNudge(dx * step, dy * step)} className="flex-1 px-0 shadow-sm">
                {ic}
              </Button>
            ))}
          </div>
          <Button
            variant="secondary"
            size="lg"
            aria-label={`Шаг ${step} мм, нажмите, чтобы сменить`}
            onClick={() => setStep((s) => (s === 1 ? 5 : 1))}
            className="tabular shrink-0 px-3.5 text-accent"
          >
            {step} мм
          </Button>
        </div>
        {box && (
          <>
            {label('Положение и размер, мм')}
            <div className="flex gap-2.5">
              {num('x', 'X')}
              {num('y', 'Y')}
              {num('w', 'Ш')}
              {num('h', 'В')}
            </div>
          </>
        )}
      </div>
    </BottomSheet>
  );
}

/**
 * Панель оформления над клавиатурой — пока текст правят на месте.
 *
 * Шрифт, кегль и выравнивание — свойства блока целиком: на грамоте один
 * блок — одна строка, и «половину строки другим шрифтом» здесь не набирают.
 * Начертания — по выделению, силами TipTap. Нажатие по панели не уводит
 * фокус из текста, иначе клавиатура пряталась бы на каждой кнопке.
 */
export function PhoneFormatBar({
  editor,
  base,
  fields,
  onProps,
  onInsertField,
  onDone,
}: {
  editor: Editor | null;
  base: TextProps;
  fields: FieldInfo[];
  onProps: (patch: Partial<TextProps>) => void;
  onInsertField: (field: FieldInfo) => void;
  onDone: () => void;
}) {
  const nextAlign: Record<string, TextProps['align']> = { left: 'center', center: 'right', right: 'left', justify: 'left' };
  const AlignIcon = base.align === 'left' ? AlignLeft : base.align === 'right' ? AlignRight : AlignCenter;
  return (
    <div data-rich-toolbar className="shrink-0 border-t border-line bg-surface" onPointerDown={(e) => e.preventDefault()}>
      <div className="flex items-center gap-0.5 px-1.5 pt-1">
        <Select
          aria-label="Шрифт"
          value={base.fontFamily}
          onChange={(fontFamily) => onProps({ fontFamily })}
          options={FONTS.map((f) => ({ value: f, label: f }))}
          className="w-28"
        />
        <span className="flex items-center rounded-control bg-sunken">
          <IconButton label="Меньше" onClick={() => onProps({ fontSize: Math.max(4, base.fontSize - 1) })}>
            <Minus size={16} />
          </IconButton>
          <span className="tabular min-w-6 text-center text-base">{base.fontSize}</span>
          <IconButton label="Больше" onClick={() => onProps({ fontSize: Math.min(200, base.fontSize + 1) })}>
            <Plus size={16} />
          </IconButton>
        </span>
        {editor && <Marks editor={editor} />}
        <IconButton label="Выравнивание" className="text-ink" onClick={() => onProps({ align: nextAlign[base.align] ?? 'center' })}>
          <AlignIcon size={20} />
        </IconButton>
        <IconButton label="Готово" variant="primary" className="ml-auto" onClick={onDone}>
          <Check size={20} />
        </IconButton>
      </div>
      {/* Поля таблицы — фишками: вставляются в каретку. Ряд прокручивается. */}
      <div className="no-scrollbar flex items-center gap-2 overflow-x-auto px-3 pt-1.5 pb-[max(8px,env(safe-area-inset-bottom))]">
        {fields.map((f) => (
          <Button
            key={f.source}
            size="sm"
            variant="secondary"
            icon={<Plus size={16} />}
            onClick={() => onInsertField(f)}
            className="shrink-0 text-accent"
          >
            {f.title}
          </Button>
        ))}
      </div>
    </div>
  );
}

/** Начертание выделенного куска. Подсветка следит за кареткой. */
function Marks({ editor }: { editor: Editor }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({ bold: e.isActive('bold'), italic: e.isActive('italic'), underline: e.isActive('underline') }),
  });
  const mark = (name: 'bold' | 'italic' | 'underline') => editor.chain().focus().toggleMark(name).run();
  const b = (label: string, icon: ReactNode, name: 'bold' | 'italic' | 'underline', active: boolean) => (
    <IconButton label={label} active={active} className={cn(!active && 'text-ink')} onClick={() => mark(name)}>
      {icon}
    </IconButton>
  );
  return (
    <>
      {b('Полужирный', <Bold size={20} />, 'bold', state.bold)}
      {b('Курсив', <Italic size={20} />, 'italic', state.italic)}
      {b('Подчёркнутый', <Underline size={20} />, 'underline', state.underline)}
    </>
  );
}
