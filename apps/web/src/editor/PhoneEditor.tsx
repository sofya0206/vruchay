import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Editor } from '@tiptap/core';
import { useEditorState } from '@tiptap/react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Bold,
  Check,
  CopyPlus,
  FileSliders,
  ImageUp,
  Italic,
  Layers,
  Maximize,
  Move,
  Plus,
  SlidersHorizontal,
  Trash2,
  Type,
  Underline,
  Variable,
} from 'lucide-react';
import type { RichDoc, TextElement } from '@gramota/shared';
import type { FieldInfo } from './fields';
import { InlineTextEditor } from './rich/InlineTextEditor';
import { cn } from '../ui/cn';
import { useVisualViewport } from '../ui/useMediaQuery';

/*
 * Редактор листа на телефоне.
 *
 * На десктопе всё, чем правят лист, стоит панелью значков сверху и колонкой
 * справа. На телефоне верх экрана большим пальцем не достать, а колонка
 * в 320 точек съедала бы весь лист. Поэтому здесь три вещи:
 *
 * — нижняя панель, которая меняется от того, выбран ли блок (как в Canva:
 *   без выбора — что добавить на лист, с выбором — что сделать с блоком);
 * — крестовина точного сдвига: тащить пальцем на миллиметр — лотерея;
 * — правка текста в своём слое крупным кеглем, а не на листе в 30 %.
 */

type Panel = 'props' | 'layers' | 'fields';

/** Кнопка нижней панели: значок и короткая подпись под ним. */
function BarButton({
  icon,
  label,
  onClick,
  active = false,
  disabled = false,
  danger = false,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active || undefined}
      className={cn(
        'flex h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] leading-tight transition-colors disabled:opacity-40',
        active ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'text-[var(--text-muted)] active:bg-[var(--surface-sunken)]',
        danger && !active && 'text-[var(--danger)]',
      )}
    >
      {icon}
      <span className="max-w-full truncate">{label}</span>
    </button>
  );
}

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
  panel,
  nudgeOpen,
  onInsert,
  onPanel,
  onBackground,
  backgroundBusy,
  onFit,
  onEditText,
  onNudge,
  onDuplicate,
  onDelete,
  onDone,
}: {
  selectedCount: number;
  canEditText: boolean;
  locked: boolean;
  panel: Panel | null;
  nudgeOpen: boolean;
  onInsert: () => void;
  onPanel: (panel: Panel) => void;
  onBackground: () => void;
  backgroundBusy: boolean;
  onFit: () => void;
  onEditText: () => void;
  onNudge: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onDone: () => void;
}) {
  return (
    <div
      role="toolbar"
      aria-label={selectedCount ? 'Действия с блоком' : 'Инструменты листа'}
      className="flex shrink-0 gap-0.5 border-t border-[var(--line)] bg-[var(--surface)] px-1 py-1"
    >
      {selectedCount > 0 ? (
        <>
          {canEditText && <BarButton icon={<Type size={20} />} label="Текст" onClick={onEditText} />}
          <BarButton
            icon={<SlidersHorizontal size={20} />}
            label="Свойства"
            active={panel === 'props'}
            onClick={() => onPanel('props')}
          />
          <BarButton icon={<Move size={20} />} label="Сдвиг" active={nudgeOpen} disabled={locked} onClick={onNudge} />
          <BarButton icon={<CopyPlus size={20} />} label="Копия" onClick={onDuplicate} />
          <BarButton icon={<Trash2 size={20} />} label="Удалить" danger onClick={onDelete} />
          <BarButton icon={<Check size={20} />} label="Готово" onClick={onDone} />
        </>
      ) : (
        <>
          <BarButton icon={<Plus size={20} />} label="Вставить" onClick={onInsert} />
          <BarButton
            icon={<Variable size={20} />}
            label="Поля"
            active={panel === 'fields'}
            onClick={() => onPanel('fields')}
          />
          <BarButton
            icon={<ImageUp size={20} />}
            label={backgroundBusy ? 'Грузим…' : 'Бланк'}
            disabled={backgroundBusy}
            onClick={onBackground}
          />
          <BarButton
            icon={<Layers size={20} />}
            label="Слои"
            active={panel === 'layers'}
            onClick={() => onPanel('layers')}
          />
          {/* Без выбранного блока панель свойств показывает сам лист:
              мероприятие, формат, проверку по QR. */}
          <BarButton
            icon={<FileSliders size={20} />}
            label="Лист"
            active={panel === 'props'}
            onClick={() => onPanel('props')}
          />
          <BarButton icon={<Maximize size={20} />} label="Вписать" onClick={onFit} />
        </>
      )}
    </div>
  );
}

/** Шаги сдвига: миллиметр — подогнать, пять — переставить. */
type NudgeStep = 1 | 5;

/**
 * Крестовина точного сдвига.
 *
 * Пальцем блок встаёт «примерно туда», а грамоте нужно «ровно по центру
 * линии». Стрелки двигают на миллиметр или на пять — тем же путём, что
 * стрелки клавиатуры на десктопе.
 */
export function NudgePad({ onNudge }: { onNudge: (dxMm: number, dyMm: number) => void }) {
  const [step, setStep] = useState<NudgeStep>(1);
  const arrow = (label: string, icon: ReactNode, dx: number, dy: number) => (
    <button
      type="button"
      aria-label={label}
      onClick={() => onNudge(dx * step, dy * step)}
      className="grid size-11 place-items-center rounded-full text-[var(--text)] active:bg-[var(--accent-soft)] active:text-[var(--accent)]"
    >
      {icon}
    </button>
  );
  /*
   * Полоской внизу холста, а не крестом посреди: крест в три ряда закрывал
   * половину листа — ту самую, на которой блок и двигают.
   */
  return (
    <div
      role="group"
      aria-label="Точный сдвиг блока"
      className="absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-0.5 rounded-full bg-[var(--surface)] p-1 shadow-lg ring-1 ring-[var(--line)]"
    >
      {arrow('Сдвинуть влево', <ArrowLeft size={20} />, -1, 0)}
      {arrow('Сдвинуть вверх', <ArrowUp size={20} />, 0, -1)}
      {arrow('Сдвинуть вниз', <ArrowDown size={20} />, 0, 1)}
      {arrow('Сдвинуть вправо', <ArrowRight size={20} />, 1, 0)}
      <span aria-hidden className="mx-0.5 h-6 w-px bg-[var(--line)]" />
      <button
        type="button"
        onClick={() => setStep((s) => (s === 1 ? 5 : 1))}
        aria-label={`Шаг ${step} мм, нажмите, чтобы сменить`}
        className="tabular h-11 rounded-full px-3 text-sm font-medium whitespace-nowrap text-[var(--accent)] active:bg-[var(--accent-soft)]"
      >
        {step} мм
      </button>
    </div>
  );
}

/**
 * Лист, вписанный по ширине в свою рамку, — для образца над правкой текста.
 * Рисуется в натуральную величину и ужимается преобразованием, как холст.
 */
function FitBox({
  width,
  height,
  maxHeight,
  children,
}: {
  width: number;
  height: number;
  maxHeight: number;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setRoom(el.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const scale = room ? Math.min(room / width, maxHeight / height) : 0;
  return (
    <div ref={ref} className="flex justify-center">
      {scale > 0 && (
        <div
          className="overflow-hidden rounded-md shadow-sm ring-1 ring-[var(--line)]"
          style={{ width: width * scale, height: height * scale }}
        >
          <div style={{ width, height, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
            {children}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Правка текста блока на телефоне — слоем во весь видимый экран.
 *
 * На листе, вписанном в ширину телефона, кегль 14 превращается в 4 точки:
 * править его на месте — значит править вслепую. Здесь тот же блок набран
 * крупно, а сверху стоит живой образец листа: видно, как ляжет длинная
 * фамилия, пока её набирают. Приём тот же, что у Adobe Express и Canva
 * на телефоне: текст правят отдельно от холста, результат видят на нём.
 *
 * Слой держится видимой части окна, а не всего экрана: на iOS клавиатура
 * ложится поверх страницы, и полоса полей внизу иначе ушла бы под неё.
 */
export function PhoneTextSheet({
  element,
  preview,
  previewSize,
  fields,
  data,
  known,
  labels,
  onEditor,
  onChange,
  onDone,
}: {
  element: TextElement;
  /** Лист в натуральную величину — для образца сверху. */
  preview: ReactNode;
  previewSize: { width: number; height: number };
  fields: FieldInfo[];
  data: Record<string, string>;
  known: ReadonlySet<string> | null;
  labels: Record<string, string>;
  onEditor?: (editor: Editor | null) => void;
  onChange: (doc: RichDoc) => void;
  onDone: (doc: RichDoc) => void;
}) {
  const viewport = useVisualViewport();
  const [editor, setEditor] = useState<Editor | null>(null);
  const latest = useRef<RichDoc>(element.props.doc);
  // Выход приходит двумя путями — по «Готово» и по уходу фокуса из поля;
  // в историю листа должен попасть один шаг, а не два.
  const finished = useRef(false);
  const finish = (doc: RichDoc) => {
    if (finished.current) return;
    finished.current = true;
    onDone(doc);
  };

  useEffect(() => {
    const root = document.documentElement;
    const before = root.style.overflow;
    root.style.overflow = 'hidden';
    return () => {
      root.style.overflow = before;
    };
  }, []);

  const columns = fields.filter((f) => f.kind === 'column');
  const system = fields.filter((f) => f.kind === 'system');
  const insert = (field: FieldInfo) =>
    editor
      ?.chain()
      .focus()
      .insertContent([
        { type: 'mergeField', attrs: { source: field.source, fieldId: field.fieldId } },
        { type: 'text', text: ' ' },
      ])
      .run();

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Текст блока"
      className="fixed inset-x-0 z-50 flex flex-col bg-[var(--surface)] text-[var(--text)]"
      style={{ top: viewport.top, height: viewport.height }}
    >
      <header
        className="flex shrink-0 items-center gap-2 border-b border-[var(--line)] px-4 py-2"
        style={{ paddingTop: 'max(8px, env(safe-area-inset-top))' }}
      >
        <h2 className="min-w-0 flex-1 truncate text-base font-medium">Текст блока</h2>
        <button
          type="button"
          onClick={() => finish(latest.current)}
          className="h-11 rounded-xl bg-[var(--accent)] px-5 text-base font-medium text-[var(--accent-contrast)] active:bg-[var(--accent-hover)]"
        >
          Готово
        </button>
      </header>

      <div className="shrink-0 bg-[var(--surface-sunken)] px-3 py-2">
        <FitBox width={previewSize.width} height={previewSize.height} maxHeight={Math.max(96, viewport.height * 0.24)}>
          {preview}
        </FitBox>
      </div>

      <div
        className="min-h-0 flex-1 overflow-y-auto px-4 py-3"
        style={{
          fontFamily: element.props.fontFamily,
          textAlign: element.props.align === 'justify' ? 'left' : element.props.align,
          fontSize: 18,
          lineHeight: 1.45,
        }}
      >
        <div className="min-h-24 rounded-xl px-3 py-2 ring-1 ring-[var(--line-strong)] focus-within:ring-2 focus-within:ring-[var(--focus)]">
          <InlineTextEditor
            element={element}
            fields={fields}
            data={data}
            known={known}
            labels={labels}
            toolbar={false}
            onEditor={(e) => {
              setEditor(e);
              onEditor?.(e);
            }}
            onChange={(doc) => {
              latest.current = doc;
              onChange(doc);
            }}
            onDone={finish}
          />
        </div>
        <p className="mt-2 text-left text-sm text-[var(--text-muted)]" style={{ fontFamily: 'inherit' }}>
          Поле подставится из таблицы у каждого получателя своё. Вставить — кнопкой внизу или знаком %.
        </p>
      </div>

      {/* Полоса над клавиатурой. Нажатие по ней не уводит фокус из текста —
          иначе клавиатура пряталась бы на каждой кнопке. */}
      <div
        data-rich-toolbar
        className="flex shrink-0 items-center gap-1 overflow-x-auto border-t border-[var(--line)] px-2 py-2"
        style={{ paddingBottom: 'max(8px, env(safe-area-inset-bottom))' }}
        onPointerDown={(e) => e.preventDefault()}
      >
        {editor && <Marks editor={editor} />}
        <span aria-hidden className="mx-1 h-6 w-px shrink-0 bg-[var(--line)]" />
        {[...columns, ...system].map((f) => (
          <button
            key={f.source}
            type="button"
            onClick={() => insert(f)}
            className="inline-flex h-11 shrink-0 items-center gap-1 rounded-full bg-[var(--accent-soft)] px-3.5 text-sm font-medium whitespace-nowrap text-[var(--accent)]"
          >
            <Plus size={14} />
            {f.title}
          </button>
        ))}
      </div>
    </div>,
    document.body,
  );
}

/** Начертание выделенного куска. Подсветка следит за кареткой. */
function Marks({ editor }: { editor: Editor }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
    }),
  });
  const mark = (name: 'bold' | 'italic' | 'underline') => editor.chain().focus().toggleMark(name).run();
  return (
    <>
      <MarkButton label="Полужирный" onClick={() => mark('bold')} active={state.bold}>
        <Bold size={18} />
      </MarkButton>
      <MarkButton label="Курсив" onClick={() => mark('italic')} active={state.italic}>
        <Italic size={18} />
      </MarkButton>
      <MarkButton label="Подчёркнутый" onClick={() => mark('underline')} active={state.underline}>
        <Underline size={18} />
      </MarkButton>
    </>
  );
}

function MarkButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={Boolean(active)}
      onClick={onClick}
      className={cn(
        'grid size-11 shrink-0 place-items-center rounded-xl',
        active ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'text-[var(--text)] active:bg-[var(--surface-sunken)]',
      )}
    >
      {children}
    </button>
  );
}
