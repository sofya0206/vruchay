import {
  AlignCenter,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignHorizontalJustifyCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  AlignVerticalJustifyCenter,
  ArrowDownToLine,
  ArrowUpToLine,
  Bold,
  CaseUpper,
  Group,
  Italic,
  MousePointerSquareDashed,
  Paintbrush,
  Pipette,
  Trash2,
  Underline,
  Ungroup,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { describeSize, type SheetElement, type ShapeElement, type TextProps } from '@gramota/shared';
import type { DocumentDetail } from '../api/types';
import { PageSizePicker, type PageSizeValue } from '../documents/PageSizePicker';
import { EventFields, type EventValues } from './EventFields';
import { VerifySettings } from './VerifySettings';
import { ColorField } from './ColorField';
import { FONTS } from './fonts-list';
import { MIXED, commonTextProps, commonValue, type AlignKind } from './selection';
import type { Box } from './geometry';
import { Button } from '../ui/Button';
import { Input, Label } from '../ui/Field';
import { Select } from '../ui/Select';

interface Props {
  /** Выбранные блоки: ни одного, один или несколько. */
  elements: SheetElement[];
  page: { w: number; h: number };
  onTextProps: (patch: Partial<TextProps>, commit?: boolean) => void;
  onShapeProps: (patch: Partial<ShapeElement['props']>, commit?: boolean) => void;
  onElement: (patch: Partial<Pick<SheetElement, 'rotation' | 'opacity' | 'locked' | 'hidden' | 'name'>>, commit?: boolean) => void;
  onBox: (id: string, box: Box) => void;
  onAlign: (kind: AlignKind) => void;
  onDistribute: (axis: 'h' | 'v') => void;
  onGroup: () => void;
  onUngroup: () => void;
  onLayer: (where: 'top' | 'bottom') => void;
  onApplyStyleToAll: () => void;
  onCopyStyle: () => void;
  onPasteStyle: () => void;
  hasStyleClipboard: boolean;
  onDelete: () => void;
  /** Материал целиком — для его собственных настроек, когда блок не выбран. */
  doc?: DocumentDetail;
  onSaveEvent?: (
    values: Partial<Record<keyof EventValues, string | null>> & { verifyEnabled?: boolean; verifyFields?: string[] },
  ) => void;
  /** Что набрано в «О мероприятии» сейчас — чтобы холст обновлялся при вводе. */
  onEventDraft?: (values: EventValues) => void;
  /** Смена размера листа: вопрос «что делать с блоками» задаёт страница. */
  onResizePage?: (size: PageSizeValue) => void;
}

/** «Смешанное» в поле ввода — пустое место с подсказкой, а не ложное число. */
const MIXED_PLACEHOLDER = 'Смешанное';

function shown<T>(value: T | typeof MIXED | undefined): T | undefined {
  return value === MIXED ? undefined : value;
}

/**
 * Панель свойств: один блок — все его свойства, несколько — общие.
 *
 * Различающееся свойство показано как «Смешанное» и меняется у всех разом:
 * человек выделил три подписи и ставит им один кегль, не переключаясь
 * по одной. Содержимое текста правится на холсте, а не здесь — по двойному
 * клику по блоку.
 */
export function PropertiesPanel(props: Props) {
  const { elements, doc, onSaveEvent, onEventDraft } = props;

  if (elements.length === 0) {
    return (
      <div>
        {doc && onSaveEvent ? (
          <>
            {props.onResizePage && (
              <div className="mb-6">
                <PageSettings doc={doc} onResize={props.onResizePage} />
              </div>
            )}
            <EventFields doc={doc} onSave={onSaveEvent} onDraft={onEventDraft} />
            <div className="mt-6">
              <VerifySettings doc={doc} onSave={onSaveEvent} />
            </div>
          </>
        ) : (
          <>
            <MousePointerSquareDashed size={22} className="mb-3 text-[var(--text-muted)]" strokeWidth={1.5} />
            <p className="text-sm text-[var(--text-muted)]">
              Выберите блок на листе, чтобы изменить его свойства.
            </p>
          </>
        )}
      </div>
    );
  }

  const single = elements.length === 1 ? elements[0] : null;
  const texts = elements.filter((el) => el.type === 'text');
  const shapes = elements.filter((el): el is ShapeElement => el.type === 'shape');
  const common = commonTextProps(elements);
  const locked = commonValue(elements.map((el) => el.locked));
  const hidden = commonValue(elements.map((el) => el.hidden));
  const rotation = commonValue(elements.map((el) => el.rotation));
  const opacity = commonValue(elements.map((el) => el.opacity));
  const grouped = elements.some((el) => el.groupId);

  return (
    <div className="space-y-5">
      {elements.length > 1 && (
        <p className="text-sm text-[var(--text-muted)]">
          Выбрано блоков: {elements.length}. Изменения применяются ко всем.
        </p>
      )}

      {single && (
        <label className="block">
          <Label>Название в слоях</Label>
          <Input
            value={single.name ?? ''}
            placeholder="по содержимому"
            maxLength={100}
            onChange={(e) => props.onElement({ name: e.target.value || null }, false)}
            onBlur={(e) => props.onElement({ name: e.target.value || null })}
          />
        </label>
      )}

      {/* Положение и размер — числами, в миллиметрах. Пиксели здесь
          не показываются никогда: макет хранится и печатается в мм. */}
      {single && (
        <div>
          <Label>Положение и размер, мм</Label>
          <div className="grid grid-cols-4 gap-1.5">
            {(['x', 'y', 'w', 'h'] as const).map((key) => (
              <label key={key} className="block">
                <span className="block text-center text-[10px] uppercase text-[var(--text-muted)]">{key}</span>
                <Input
                  type="number"
                  step={0.5}
                  value={round(single[key])}
                  onChange={(e) => {
                    const value = Number(e.target.value);
                    if (!Number.isFinite(value)) return;
                    props.onBox(single.id, { x: single.x, y: single.y, w: single.w, h: single.h, [key]: value });
                  }}
                  className="tabular px-1 text-center"
                />
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <Label>Поворот, °</Label>
          <Input
            type="number"
            min={-360}
            max={360}
            step={1}
            value={shown(rotation) ?? ''}
            placeholder={rotation === MIXED ? MIXED_PLACEHOLDER : '0'}
            onChange={(e) => props.onElement({ rotation: clampNumber(e.target.value, -360, 360, 0) })}
            className="tabular"
          />
        </label>
        <label className="block">
          <Label>Прозрачность, %</Label>
          <Input
            type="number"
            min={0}
            max={100}
            step={5}
            value={opacity === MIXED || opacity === undefined ? '' : Math.round(opacity * 100)}
            placeholder={opacity === MIXED ? MIXED_PLACEHOLDER : '100'}
            onChange={(e) => props.onElement({ opacity: clampNumber(e.target.value, 0, 100, 100) / 100 })}
            className="tabular"
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Toggle active={locked === true} onClick={() => props.onElement({ locked: locked !== true })}>
          {locked === true ? 'Заперт' : locked === MIXED ? 'Замок: смешанное' : 'Запереть от сдвига'}
        </Toggle>
        <Toggle active={hidden === true} onClick={() => props.onElement({ hidden: hidden !== true })}>
          {hidden === true ? 'Скрыт' : 'Скрыть'}
        </Toggle>
      </div>

      {/* Выравнивание: одного блока — по листу, нескольких — между собой. */}
      <div>
        <Label>{elements.length > 1 ? 'Выровнять между собой' : 'Выровнять по листу'}</Label>
        <div className="flex gap-1">
          {(
            [
              ['left', AlignStartVertical, 'По левому краю'],
              ['hcenter', AlignHorizontalJustifyCenter, 'По центру по горизонтали'],
              ['right', AlignEndVertical, 'По правому краю'],
              ['top', ArrowUpToLine, 'По верхнему краю'],
              ['vcenter', AlignVerticalJustifyCenter, 'По центру по вертикали'],
              ['bottom', ArrowDownToLine, 'По нижнему краю'],
            ] as const
          ).map(([kind, Icon, title]) => (
            <IconToggle key={kind} active={false} title={title} onClick={() => props.onAlign(kind)}>
              <Icon size={15} />
            </IconToggle>
          ))}
        </div>
        {elements.length > 2 && (
          <div className="mt-1.5 flex gap-1">
            <IconToggle active={false} title="Распределить по горизонтали" onClick={() => props.onDistribute('h')}>
              <AlignHorizontalDistributeCenter size={15} />
            </IconToggle>
            <IconToggle active={false} title="Распределить по вертикали" onClick={() => props.onDistribute('v')}>
              <AlignVerticalDistributeCenter size={15} />
            </IconToggle>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {elements.length > 1 && !grouped && (
          <Button size="sm" variant="ghost" icon={<Group size={14} />} onClick={props.onGroup} title="Ctrl+G">
            Сгруппировать
          </Button>
        )}
        {grouped && (
          <Button size="sm" variant="ghost" icon={<Ungroup size={14} />} onClick={props.onUngroup} title="Ctrl+Shift+G">
            Разгруппировать
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => props.onLayer('top')}>
          На передний план
        </Button>
        <Button size="sm" variant="ghost" onClick={() => props.onLayer('bottom')}>
          На задний план
        </Button>
      </div>

      {texts.length > 0 && (
        <TextSection
          common={common}
          onChange={props.onTextProps}
          onApplyStyleToAll={props.onApplyStyleToAll}
          onCopyStyle={props.onCopyStyle}
          onPasteStyle={props.onPasteStyle}
          hasStyleClipboard={props.hasStyleClipboard}
        />
      )}

      {shapes.length > 0 && texts.length === 0 && (
        <ShapeSection shapes={shapes} onChange={props.onShapeProps} />
      )}

      {single && single.type !== 'text' && single.type !== 'shape' && (
        <p className="text-sm text-[var(--text-muted)]">
          У этого блока пока нет настроек, кроме положения и размера.
        </p>
      )}

      <Button variant="danger" icon={<Trash2 size={15} />} onClick={props.onDelete} className="w-full">
        {elements.length > 1 ? `Удалить блоки (${elements.length})` : 'Удалить блок'}
      </Button>
    </div>
  );
}

/**
 * Размер листа — здесь же, где остальные настройки материала.
 *
 * Применяется не на каждое изменение, а кнопкой: смена размера — вопрос
 * с последствиями для всех блоков, и его задаёт отдельный диалог.
 */
function PageSettings({ doc, onResize }: { doc: DocumentDetail; onResize: (size: PageSizeValue) => void }) {
  const current = { widthMm: doc.pageWidthMm, heightMm: doc.pageHeightMm };
  const [draft, setDraft] = useState<PageSizeValue>(current);
  useEffect(() => setDraft({ widthMm: doc.pageWidthMm, heightMm: doc.pageHeightMm }), [doc.pageWidthMm, doc.pageHeightMm]);
  const changed = draft.widthMm !== current.widthMm || draft.heightMm !== current.heightMm;

  return (
    <div>
      <p className="mb-2 text-sm font-medium">Лист: {describeSize(current)}</p>
      <PageSizePicker value={draft} onChange={setDraft} />
      {changed && (
        <Button size="sm" variant="primary" onClick={() => onResize(draft)} className="mt-2">
          Сменить лист на {describeSize(draft)}
        </Button>
      )}
    </div>
  );
}

function TextSection({
  common,
  onChange,
  onApplyStyleToAll,
  onCopyStyle,
  onPasteStyle,
  hasStyleClipboard,
}: {
  common: Partial<Record<keyof TextProps, unknown>>;
  onChange: (patch: Partial<TextProps>, commit?: boolean) => void;
  onApplyStyleToAll: () => void;
  onCopyStyle: () => void;
  onPasteStyle: () => void;
  hasStyleClipboard: boolean;
}) {
  const p = common as Partial<Record<keyof TextProps, unknown | typeof MIXED>>;
  const str = (key: keyof TextProps) => (p[key] === MIXED ? '' : ((p[key] as string | undefined) ?? ''));
  const num = (key: keyof TextProps) => (p[key] === MIXED ? '' : ((p[key] as number | undefined) ?? ''));
  const bool = (key: keyof TextProps) => p[key] === true;
  const ph = (key: keyof TextProps, fallback: string) => (p[key] === MIXED ? MIXED_PLACEHOLDER : fallback);

  return (
    <div className="space-y-4 border-t border-[var(--line)] pt-4">
      <p className="text-xs text-[var(--text-muted)]">
        Текст правится на листе: двойной клик по блоку. Здесь — оформление блока целиком;
        отдельные слова оформляются на листе, панелью над блоком.
      </p>

      <div className="block">
        <Label>Шрифт</Label>
        <Select
          value={str('fontFamily')}
          onChange={(fontFamily) => onChange({ fontFamily })}
          aria-label="Шрифт"
          options={[
            /* Выделено несколько блоков с разными шрифтами — первой строкой
               «Смешанное»: показать шрифт первого значило бы соврать. */
            ...(p.fontFamily === MIXED ? [{ value: '', label: MIXED_PLACEHOLDER }] : []),
            ...FONTS.map((f) => ({ value: f, label: f })),
          ]}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <Label>Кегль, pt</Label>
          <Input
            type="number"
            min={4}
            max={200}
            step={0.5}
            value={num('fontSize')}
            placeholder={ph('fontSize', '16')}
            onChange={(e) => onChange({ fontSize: clampNumber(e.target.value, 4, 200, 16) })}
            className="tabular"
          />
        </label>
        <label className="block">
          <Label>Межстрочный</Label>
          <Input
            type="number"
            min={0.5}
            max={4}
            step={0.05}
            value={num('lineHeight')}
            placeholder={ph('lineHeight', '1.2')}
            onChange={(e) => onChange({ lineHeight: clampNumber(e.target.value, 0.5, 4, 1.2) })}
            className="tabular"
          />
        </label>
        <label className="block">
          <Label>Разрядка, pt</Label>
          <Input
            type="number"
            min={-5}
            max={30}
            step={0.25}
            value={num('letterSpacing')}
            placeholder={ph('letterSpacing', '0')}
            onChange={(e) => onChange({ letterSpacing: clampNumber(e.target.value, -5, 30, 0) })}
            className="tabular"
          />
        </label>
        <label className="block">
          <Label>Отступ внутри, мм</Label>
          <Input
            type="number"
            min={0}
            max={50}
            step={0.5}
            value={num('padding')}
            placeholder={ph('padding', '0')}
            onChange={(e) => onChange({ padding: clampNumber(e.target.value, 0, 50, 0) })}
            className="tabular"
          />
        </label>
      </div>

      <div>
        <Label>Цвет</Label>
        <ColorField value={(shown(p.color as string | typeof MIXED) as string) ?? '#000000'} onChange={(color) => onChange({ color })} />
      </div>

      <div>
        <Label>Выравнивание</Label>
        <div className="flex gap-1">
          {(
            [
              ['left', AlignLeft, 'По левому краю (Ctrl+L)'],
              ['center', AlignCenter, 'По центру (Ctrl+E)'],
              ['right', AlignRight, 'По правому краю (Ctrl+R)'],
              ['justify', AlignJustify, 'По ширине'],
            ] as const
          ).map(([value, Icon, title]) => (
            <IconToggle key={value} active={p.align === value} title={title} onClick={() => onChange({ align: value })}>
              <Icon size={16} />
            </IconToggle>
          ))}
        </div>
        <div className="mt-1.5 flex gap-1">
          {(
            [
              ['top', 'Вверх'],
              ['middle', 'По центру'],
              ['bottom', 'Вниз'],
            ] as const
          ).map(([value, label]) => (
            <Toggle key={value} active={p.verticalAlign === value} onClick={() => onChange({ verticalAlign: value })}>
              {label}
            </Toggle>
          ))}
        </div>
      </div>

      <div>
        <Label>Начертание блока</Label>
        <div className="flex gap-1">
          <IconToggle active={bool('bold')} onClick={() => onChange({ bold: !bool('bold') })} title="Полужирный (Ctrl+B)">
            <Bold size={16} />
          </IconToggle>
          <IconToggle active={bool('italic')} onClick={() => onChange({ italic: !bool('italic') })} title="Курсив (Ctrl+I)">
            <Italic size={16} />
          </IconToggle>
          <IconToggle active={bool('underline')} onClick={() => onChange({ underline: !bool('underline') })} title="Подчёркнутый (Ctrl+U)">
            <Underline size={16} />
          </IconToggle>
          <IconToggle active={bool('uppercase')} onClick={() => onChange({ uppercase: !bool('uppercase') })} title="ПРОПИСНЫМИ">
            <CaseUpper size={16} />
          </IconToggle>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Toggle active={bool('shadow')} onClick={() => onChange({ shadow: !bool('shadow') })}>
          Тень
        </Toggle>
        <Toggle active={bool('autoFit')} onClick={() => onChange({ autoFit: !bool('autoFit') })}>
          Уменьшать кегль, если не влезает
        </Toggle>
      </div>

      {/* Обводка нужна там, где текст ложится на пёстрый фон и сливается
          с ним. Толщину даём в миллиметрах, как и всё остальное в макете. */}
      <div>
        <Label>Обводка букв</Label>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={0}
            max={2}
            step={0.05}
            value={num('strokeWidth')}
            placeholder={ph('strokeWidth', '0')}
            onChange={(e) => onChange({ strokeWidth: clampNumber(e.target.value, 0, 2, 0) })}
            className="w-20"
          />
          <span className="text-sm text-[var(--text-muted)]">мм</span>
          <div className="min-w-0 flex-1">
            <ColorField
              value={(shown(p.strokeColor as string | typeof MIXED) as string) ?? '#ffffff'}
              onChange={(strokeColor) => onChange({ strokeColor })}
              disabled={p.strokeWidth === 0}
              label="Цвет обводки"
            />
          </div>
        </div>
      </div>

      <div>
        <Label>Рамка и заливка блока</Label>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={0}
            max={5}
            step={0.1}
            value={num('borderWidth')}
            placeholder={ph('borderWidth', '0')}
            onChange={(e) => onChange({ borderWidth: clampNumber(e.target.value, 0, 5, 0) })}
            className="w-20"
          />
          <span className="text-sm text-[var(--text-muted)]">мм</span>
          <div className="min-w-0 flex-1">
            <ColorField
              value={(shown(p.borderColor as string | typeof MIXED) as string) ?? '#000000'}
              onChange={(borderColor) => onChange({ borderColor })}
              disabled={p.borderWidth === 0}
              label="Цвет рамки"
            />
          </div>
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <Toggle active={p.background != null && p.background !== MIXED} onClick={() => onChange({ background: p.background ? null : '#ffffff' })}>
            Заливка
          </Toggle>
          {p.background != null && p.background !== MIXED && (
            <div className="min-w-0 flex-1">
              <ColorField value={p.background as string} onChange={(background) => onChange({ background })} label="Цвет заливки" />
            </div>
          )}
        </div>
      </div>

      {/* Стиль с блока на блок: пипетка снимает, кисть применяет. И «на все» —
          один шрифт и цвет на все текстовые блоки листа одной кнопкой. */}
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" variant="ghost" icon={<Pipette size={14} />} onClick={onCopyStyle} title="Снять оформление с этого блока">
          Снять стиль
        </Button>
        <Button size="sm" variant="ghost" icon={<Paintbrush size={14} />} onClick={onPasteStyle} disabled={!hasStyleClipboard} title="Применить снятое оформление">
          Применить стиль
        </Button>
        <Button size="sm" variant="ghost" onClick={onApplyStyleToAll} title="Шрифт и цвет этого блока — на все текстовые блоки листа">
          Шрифт и цвет — на все
        </Button>
      </div>
    </div>
  );
}

function ShapeSection({
  shapes,
  onChange,
}: {
  shapes: ShapeElement[];
  onChange: (patch: Partial<ShapeElement['props']>, commit?: boolean) => void;
}) {
  const kind = commonValue(shapes.map((s) => s.props.kind));
  const fill = commonValue(shapes.map((s) => s.props.fill));
  const stroke = commonValue(shapes.map((s) => s.props.stroke));
  const strokeWidth = commonValue(shapes.map((s) => s.props.strokeWidth));
  const radius = commonValue(shapes.map((s) => s.props.radius));
  const dash = commonValue(shapes.map((s) => s.props.dash));

  return (
    <div className="space-y-4 border-t border-[var(--line)] pt-4">
      <div>
        <Label>Фигура</Label>
        <div className="flex gap-1">
          {(
            [
              ['line', 'Линия'],
              ['rect', 'Прямоугольник'],
              ['ellipse', 'Овал'],
            ] as const
          ).map(([value, label]) => (
            <Toggle key={value} active={kind === value} onClick={() => onChange({ kind: value })}>
              {label}
            </Toggle>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <Label>Обводка, мм</Label>
          <Input
            type="number"
            min={0}
            max={20}
            step={0.1}
            value={strokeWidth === MIXED ? '' : (strokeWidth ?? '')}
            placeholder={strokeWidth === MIXED ? MIXED_PLACEHOLDER : '0.5'}
            onChange={(e) => onChange({ strokeWidth: clampNumber(e.target.value, 0, 20, 0.5) })}
            className="tabular"
          />
        </label>
        <label className="block">
          <Label>Пунктир, мм</Label>
          <Input
            type="number"
            min={0}
            max={50}
            step={0.5}
            value={dash === MIXED ? '' : (dash ?? '')}
            placeholder={dash === MIXED ? MIXED_PLACEHOLDER : '0'}
            onChange={(e) => onChange({ dash: clampNumber(e.target.value, 0, 50, 0) })}
            className="tabular"
          />
        </label>
      </div>
      <div>
        <Label>Цвет обводки</Label>
        <ColorField value={stroke === MIXED ? '#000000' : (stroke ?? '#000000')} onChange={(value) => onChange({ stroke: value })} />
      </div>
      {kind !== 'line' && (
        <>
          <div className="flex items-center gap-2">
            <Toggle active={fill != null && fill !== MIXED} onClick={() => onChange({ fill: fill ? null : '#ffffff' })}>
              Заливка
            </Toggle>
            {fill != null && fill !== MIXED && (
              <div className="min-w-0 flex-1">
                <ColorField value={fill} onChange={(value) => onChange({ fill: value })} label="Цвет заливки" />
              </div>
            )}
          </div>
          {kind === 'rect' && (
            <label className="block">
              <Label>Скругление углов, мм</Label>
              <Input
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={radius === MIXED ? '' : (radius ?? '')}
                onChange={(e) => onChange({ radius: clampNumber(e.target.value, 0, 100, 0) })}
                className="tabular w-28"
              />
            </label>
          )}
        </>
      )}
    </div>
  );
}

function clampNumber(raw: string, min: number, max: number, fallback: number): number {
  const value = Number(raw);
  if (raw === '' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function Toggle({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-lg px-2.5 py-1.5 text-xs ring-1 transition-colors ${
        active
          ? 'bg-[var(--accent-soft)] text-[var(--accent)] ring-[var(--accent)]/40'
          : 'text-[var(--text-muted)] ring-[var(--line-strong)] hover:bg-[var(--surface-sunken)]'
      }`}
    >
      {children}
    </button>
  );
}

function IconToggle({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={active}
      className={`grid h-9 flex-1 place-items-center rounded-lg ring-1 transition-colors ${
        active
          ? 'bg-[var(--accent-soft)] text-[var(--accent)] ring-[var(--accent)]/40'
          : 'text-[var(--text-muted)] ring-[var(--line-strong)] hover:bg-[var(--surface-sunken)]'
      }`}
    >
      {children}
    </button>
  );
}
