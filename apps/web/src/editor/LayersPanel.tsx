import { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  GripVertical,
  Image as ImageIcon,
  Link2,
  Lock,
  LockOpen,
  QrCode,
  Shapes,
  Type,
} from 'lucide-react';
import { richDocToPlainText, type SheetElement, type SheetLayout } from '@gramota/shared';
import { layersTopDown, moveLayer, reorderLayers } from './selection';
import { useTooltip } from '../ui/Tooltip';

/**
 * Панель слоёв: все блоки листа сверху вниз, как они лежат друг на друге.
 *
 * Нужна ради двух вещей, которые на холсте не сделать: достать блок,
 * закрытый другим, и запереть от случайного сдвига тот, что уже стоит
 * на месте. Порядок меняется перетаскиванием по списку — так привычнее,
 * чем «на слой выше» по одному шагу, хотя и стрелки оставлены.
 */
export function LayersPanel({
  layout,
  selected,
  onSelect,
  onChange,
}: {
  layout: SheetLayout;
  selected: ReadonlySet<string>;
  onSelect: (id: string, additive: boolean) => void;
  onChange: (next: SheetLayout) => void;
}) {
  const [dragging, setDragging] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const layers = layersTopDown(layout);

  const patch = (id: string, changes: Partial<SheetElement>) =>
    onChange(layout.map((el) => (el.id === id ? ({ ...el, ...changes } as SheetElement) : el)));

  const drop = (targetId: string) => {
    if (!dragging || dragging === targetId) return;
    const order = layers.map((el) => el.id).filter((id) => id !== dragging);
    order.splice(order.indexOf(targetId), 0, dragging);
    onChange(reorderLayers(layout, order));
  };

  if (layers.length === 0) {
    return <p className="px-1 text-sm text-[var(--text-muted)]">На листе пока нет блоков.</p>;
  }

  return (
    <ul className="space-y-0.5" aria-label="Слои">
      {layers.map((el) => {
        const active = selected.has(el.id);
        return (
          <li
            key={el.id}
            draggable
            onDragStart={(e) => {
              setDragging(el.id);
              e.dataTransfer.effectAllowed = 'move';
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(el.id);
            }}
            onDragLeave={() => setOver(null)}
            onDrop={(e) => {
              e.preventDefault();
              drop(el.id);
              setDragging(null);
              setOver(null);
            }}
            onDragEnd={() => {
              setDragging(null);
              setOver(null);
            }}
            onClick={(e) => onSelect(el.id, e.shiftKey || e.metaKey || e.ctrlKey)}
            onDoubleClick={() => setRenaming(el.id)}
            className={`group relative flex items-center gap-1.5 rounded-lg px-1.5 py-1 text-sm ${
              active ? 'bg-[var(--accent-soft)]' : 'hover:bg-[var(--surface-sunken)]'
            } ${dragging === el.id ? 'opacity-40' : el.hidden ? 'opacity-50' : ''}`}
          >
            {/* Линия вставки над строкой — как в Figma: видно, куда ляжет слой. */}
            {over === el.id && dragging !== el.id && (
              <span className="pointer-events-none absolute inset-x-1 -top-0.5 h-0.5 rounded bg-[var(--accent)]" />
            )}
            <GripVertical size={14} className="shrink-0 cursor-grab text-[var(--text-muted)]" />
            <span className="shrink-0 text-[var(--text-muted)]">{icon(el)}</span>
            {renaming === el.id ? (
              <RenameField
                value={el.name ?? ''}
                placeholder={title(el)}
                onDone={(name) => {
                  setRenaming(null);
                  if ((name || null) !== (el.name ?? null)) patch(el.id, { name: name || null });
                }}
              />
            ) : (
              <LayerName name={title(el)} />
            )}
            {/* Стрелки — только при наведении; замок и глаз остаются видны,
                пока включены: так сразу видно, что заперто и что скрыто. */}
            <span className="flex shrink-0 items-center gap-0.5">
              <Small
                hover
                title="Переместить вперёд"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(moveLayer(layout, el.id, 'up'));
                }}
              >
                <ChevronUp size={13} />
              </Small>
              <Small
                hover
                title="Переместить назад"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(moveLayer(layout, el.id, 'down'));
                }}
              >
                <ChevronDown size={13} />
              </Small>
              <Small
                title={el.locked ? 'Заперт — не двигается и не растягивается. Нажмите, чтобы отпереть' : 'Не заперт. Нажмите, чтобы запереть'}
                pressed={el.locked}
                onClick={(e) => {
                  e.stopPropagation();
                  patch(el.id, { locked: !el.locked });
                }}
              >
                {el.locked ? <Lock size={13} /> : <LockOpen size={13} />}
              </Small>
              <Small
                title={el.hidden ? 'Скрыт. Нажмите, чтобы показать' : 'Виден. Нажмите, чтобы скрыть'}
                pressed={el.hidden}
                onClick={(e) => {
                  e.stopPropagation();
                  patch(el.id, { hidden: !el.hidden });
                }}
              >
                {el.hidden ? <EyeOff size={13} /> : <Eye size={13} />}
              </Small>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Имя слоя: в панели оно обрезается, и целиком его показывает подсказка —
 * но только когда обрезано, иначе плашка всплывала бы над каждой строкой.
 */
function LayerName({ name }: { name: string }) {
  const text = useRef<HTMLSpanElement>(null);
  const { triggerProps, tooltip } = useTooltip(name, {
    onlyWhenTruncated: true,
    describes: true,
    measure: text,
  });

  return (
    <span ref={text} className="min-w-0 flex-1 truncate" {...triggerProps}>
      {name}
      {tooltip}
    </span>
  );
}

/** Имя слоя правится на месте, по двойному клику — как в Figma. */
function RenameField({
  value,
  placeholder,
  onDone,
}: {
  value: string;
  placeholder: string;
  onDone: (name: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.select(), []);

  return (
    <input
      ref={input}
      autoFocus
      value={draft}
      placeholder={placeholder}
      maxLength={100}
      aria-label="Имя слоя"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => onDone(draft.trim())}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onDone(draft.trim());
        if (e.key === 'Escape') onDone(value);
        e.stopPropagation();
      }}
      onClick={(e) => e.stopPropagation()}
      className="min-w-0 flex-1 rounded bg-[var(--surface)] px-1.5 py-0.5 text-sm ring-1 ring-[var(--focus)] outline-none"
    />
  );
}

function Small({
  title,
  pressed,
  hover,
  onClick,
  children,
}: {
  title: string;
  pressed?: boolean;
  /** Показывать только при наведении на строку (и с клавиатуры). */
  hover?: boolean;
  onClick: (e: React.MouseEvent) => void;
  children: React.ReactNode;
}) {
  const { triggerProps, tooltip } = useTooltip(title);
  const quiet = hover || !pressed;

  return (
    <button
      type="button"
      {...triggerProps}
      aria-label={title}
      aria-pressed={pressed}
      onClick={onClick}
      className={`grid h-6 w-6 place-items-center rounded transition-opacity ${
        pressed ? 'text-[var(--accent)]' : 'text-[var(--text-muted)] hover:text-[var(--text)]'
      } ${quiet ? 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100' : ''}`}
    >
      {children}
      {tooltip}
    </button>
  );
}

function icon(el: SheetElement) {
  switch (el.type) {
    case 'text':
      return <Type size={14} />;
    case 'image':
      return <ImageIcon size={14} />;
    case 'qr':
      return <QrCode size={14} />;
    case 'link':
      return <Link2 size={14} />;
    default:
      return <Shapes size={14} />;
  }
}

/** Подпись слоя: своё имя, иначе — начало содержимого. */
export function title(el: SheetElement): string {
  if (el.name) return el.name;
  switch (el.type) {
    case 'text': {
      const text = richDocToPlainText(el.props.doc).replace(/\s+/g, ' ').trim();
      return text || 'Текст';
    }
    case 'image':
      return 'Картинка';
    case 'qr':
      return 'QR-код';
    case 'link':
      return 'Ссылка';
    case 'shape':
      return el.props.kind === 'line' ? 'Линия' : el.props.kind === 'ellipse' ? 'Овал' : 'Прямоугольник';
  }
}
