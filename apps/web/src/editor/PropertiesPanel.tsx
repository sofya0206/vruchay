import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  CaseUpper,
  Italic,
  MousePointerSquareDashed,
  Trash2,
  Underline,
} from 'lucide-react';
import {
  richDocFromPlainText,
  richDocToPlainText,
  type SheetElement,
  type TextElement,
} from '@gramota/shared';
import type { DocumentDetail } from '../api/types';
import { EventFields, type EventValues } from './EventFields';
import { VerifySettings } from './VerifySettings';
import { VariableHint } from './VariableHint';
import { ColorField } from './ColorField';
import { Button } from '../ui/Button';
import { Input, Label, Select, Textarea } from '../ui/Field';

const FONTS = [
  'PT Sans',
  'PT Serif',
  'Inter',
  'Montserrat',
  'Lora',
  'Playfair Display',
  'Caveat',
  'Marck Script',
];

interface Props {
  element: SheetElement | null;
  onChange: (patch: Partial<TextElement['props']>, commit?: boolean) => void;
  onDelete: () => void;
  /** Материал целиком — для его собственных настроек, когда блок не выбран. */
  doc?: DocumentDetail;
  onSaveEvent?: (
    values: Partial<EventValues> & { verifyEnabled?: boolean; verifyFields?: string[] },
  ) => void;
  /** Что набрано в «О мероприятии» сейчас — чтобы холст обновлялся при вводе. */
  onEventDraft?: (values: EventValues) => void;
}

export function PropertiesPanel({
  element,
  onChange,
  onDelete,
  doc,
  onSaveEvent,
  onEventDraft,
}: Props) {
  if (!element) {
    return (
      <aside className="w-72 shrink-0 overflow-auto border-l border-[var(--line)] bg-[var(--surface)] p-4">
        {doc && onSaveEvent ? (
          <>
            <EventFields doc={doc} onSave={onSaveEvent} onDraft={onEventDraft} />
            <div className="mt-6">
              <VerifySettings doc={doc} onSave={onSaveEvent} />
            </div>
          </>
        ) : (
          <>
            <MousePointerSquareDashed
              size={22}
              className="mb-3 text-[var(--text-muted)]"
              strokeWidth={1.5}
            />
            <p className="text-sm text-[var(--text-muted)]">
              Выберите блок на листе, чтобы изменить его свойства.
            </p>
          </>
        )}
      </aside>
    );
  }

  if (element.type !== 'text') {
    return (
      <aside className="w-72 shrink-0 space-y-4 border-l border-[var(--line)] bg-[var(--surface)] p-4">
        <p className="text-sm text-[var(--text-muted)]">
          Свойства этого типа блока появятся в следующих обновлениях.
        </p>
        <Button variant="danger" icon={<Trash2 size={15} />} onClick={onDelete} className="w-full">
          Удалить блок
        </Button>
      </aside>
    );
  }

  const p = element.props;

  return (
    <aside className="w-72 shrink-0 space-y-5 overflow-y-auto border-l border-[var(--line)] bg-[var(--surface)] p-4">
      <label className="block">
        <Label>Текст</Label>
        <Textarea
          value={richDocToPlainText(p.doc)}
          onChange={(e) => onChange({ doc: richDocFromPlainText(e.target.value) }, false)}
          onBlur={(e) => onChange({ doc: richDocFromPlainText(e.target.value) })}
          rows={3}
        />
        <VariableHint text={richDocToPlainText(p.doc)} />
      </label>

      <label className="block">
        <Label>Шрифт</Label>
        <Select value={p.fontFamily} onChange={(e) => onChange({ fontFamily: e.target.value })}>
          {FONTS.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </Select>
      </label>

      <label className="block">
        <Label>Кегль, pt</Label>
        <Input
          type="number"
          min={4}
          max={200}
          value={p.fontSize}
          onChange={(e) => onChange({ fontSize: Number(e.target.value) || 4 })}
          className="tabular w-28"
        />
      </label>

      <div>
        <Label>Цвет</Label>
        <ColorField value={p.color} onChange={(color) => onChange({ color })} />
      </div>

      <div>
        <Label>Выравнивание</Label>
        <div className="flex gap-1">
          <IconToggle
            active={p.align === 'left'}
            onClick={() => onChange({ align: 'left' })}
            title="По левому краю"
          >
            <AlignLeft size={16} />
          </IconToggle>
          <IconToggle
            active={p.align === 'center'}
            onClick={() => onChange({ align: 'center' })}
            title="По центру"
          >
            <AlignCenter size={16} />
          </IconToggle>
          <IconToggle
            active={p.align === 'right'}
            onClick={() => onChange({ align: 'right' })}
            title="По правому краю"
          >
            <AlignRight size={16} />
          </IconToggle>
          <span className="w-2" />
          <IconToggle active={p.bold} onClick={() => onChange({ bold: !p.bold })} title="Полужирный">
            <Bold size={16} />
          </IconToggle>
          <IconToggle
            active={p.italic}
            onClick={() => onChange({ italic: !p.italic })}
            title="Курсив"
          >
            <Italic size={16} />
          </IconToggle>
          <IconToggle
            active={p.underline}
            onClick={() => onChange({ underline: !p.underline })}
            title="Подчёркнутый"
          >
            <Underline size={16} />
          </IconToggle>
          <IconToggle
            active={p.uppercase}
            onClick={() => onChange({ uppercase: !p.uppercase })}
            title="ПРОПИСНЫМИ"
          >
            <CaseUpper size={16} />
          </IconToggle>
        </div>
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
            value={p.strokeWidth}
            onChange={(e) => onChange({ strokeWidth: Math.min(2, Math.max(0, Number(e.target.value) || 0)) })}
            className="w-20"
          />
          <span className="text-sm text-[var(--text-muted)]">мм</span>
          <div className="min-w-0 flex-1">
            <ColorField
              value={p.strokeColor}
              onChange={(strokeColor) => onChange({ strokeColor })}
              disabled={p.strokeWidth === 0}
              label="Цвет обводки"
            />
          </div>
        </div>
      </div>

      <Button variant="danger" icon={<Trash2 size={15} />} onClick={onDelete} className="w-full">
        Удалить блок
      </Button>
    </aside>
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
