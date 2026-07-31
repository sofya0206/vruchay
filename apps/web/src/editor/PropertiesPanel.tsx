import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Italic,
  MousePointerSquareDashed,
  Trash2,
} from 'lucide-react';
import type { SheetElement, TextElement } from '@gramota/shared';
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
}

export function PropertiesPanel({ element, onChange, onDelete }: Props) {
  if (!element) {
    return (
      <aside className="w-72 shrink-0 border-l border-[var(--line)] bg-[var(--surface)] p-6">
        <MousePointerSquareDashed
          size={22}
          className="mb-3 text-[var(--text-muted)]"
          strokeWidth={1.5}
        />
        <p className="text-sm text-[var(--text-muted)]">
          Выберите блок на листе, чтобы изменить его свойства.
        </p>
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
          value={p.text}
          onChange={(e) => onChange({ text: e.target.value }, false)}
          onBlur={(e) => onChange({ text: e.target.value })}
          rows={3}
        />
        <span className="mt-1.5 block text-xs text-[var(--text-muted)]">
          Переменная подставит данные получателя:{' '}
          <code className="rounded bg-[var(--surface-sunken)] px-1 font-mono">%name</code>
        </span>
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

      <div className="flex gap-3">
        <label className="flex-1">
          <Label>Кегль, pt</Label>
          <Input
            type="number"
            min={4}
            max={200}
            value={p.fontSize}
            onChange={(e) => onChange({ fontSize: Number(e.target.value) || 4 })}
            className="tabular"
          />
        </label>
        <label className="w-24">
          <Label>Цвет</Label>
          <input
            type="color"
            value={p.color}
            onChange={(e) => onChange({ color: e.target.value })}
            className="h-[38px] w-full cursor-pointer rounded-lg bg-[var(--surface)] ring-1 ring-[var(--line-strong)]"
          />
        </label>
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
