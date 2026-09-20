import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useEditorState } from '@tiptap/react';
import type { Editor } from '@tiptap/core';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  AtSign,
  Bold,
  CaseSensitive,
  ChevronDown,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Plus,
  Strikethrough,
  Subscript,
  Superscript,
  Underline,
  X,
} from 'lucide-react';
import { isSafeHrefTemplate, type TextProps } from '@gramota/shared';
import type { FieldInfo } from '../fields';
import { FONTS, WEIGHTS } from '../fonts-list';
import { ColorPicker } from '../../ui/ColorPicker';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Field';
import { NumberField } from '../../ui/NumberField';
import { Popover } from '../../ui/Popover';
import { Select } from '../../ui/Select';
import { useTooltip } from '../../ui/Tooltip';

/** Зазор между панелью и блоком, и между панелью и краем холста. */
const GAP = 8;

const ALIGNS = [
  ['left', AlignLeft, 'По левому краю (Ctrl+L)'],
  ['center', AlignCenter, 'По центру (Ctrl+E)'],
  ['right', AlignRight, 'По правому краю (Ctrl+R)'],
  ['justify', AlignJustify, 'По ширине'],
] as const;

/**
 * Панель оформления над правящимся блоком.
 *
 * Здесь то, что относится к выделенному куску текста: начертание, кегль,
 * цвет, индексы, списки, поле. Всё, что относится к блоку целиком,
 * остаётся в панели свойств справа — иначе одно и то же свойство
 * жило бы в двух местах и спорило само с собой.
 *
 * Прежняя панель выводила 24 элемента в строку от левого края блока:
 * доезжала до края окна поверх панели свойств, переносилась на вторую
 * строку и обрезала поле разрядки. Теперь, как в Miro и PowerPoint,
 * в строке только частое, а редкое — во всплывающих слоях.
 */
export function FormatToolbar({
  editor,
  fields,
  base,
}: {
  editor: Editor;
  fields: FieldInfo[];
  base: TextProps;
}) {
  const bar = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ left: number; top: number } | null>(null);

  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      superscript: e.isActive('superscript'),
      subscript: e.isActive('subscript'),
      link: e.isActive('link'),
      linkHref: (e.getAttributes('link').href as string | undefined) ?? '',
      bullet: e.isActive('bulletList'),
      ordered: e.isActive('orderedList'),
      align: (e.getAttributes('paragraph').align as string | null) ?? null,
      style: e.getAttributes('textStyle') as Record<string, unknown>,
    }),
  });

  /*
   * Место панели: по центру над блоком и в границах холста. Холст — не
   * окно: справа панель свойств, слева меню, и заезжать на них панель
   * не должна. Сверху нет места — встаёт под блок.
   */
  useLayoutEffect(() => {
    const update = () => {
      const block = editor.view.dom.getBoundingClientRect();
      const canvas = editor.view.dom.closest('[data-canvas]')?.getBoundingClientRect();
      const bounds = {
        left: Math.max(canvas?.left ?? 0, 0),
        right: Math.min(canvas?.right ?? window.innerWidth, window.innerWidth),
        top: Math.max(canvas?.top ?? 0, 0),
        bottom: Math.min(canvas?.bottom ?? window.innerHeight, window.innerHeight),
      };
      const w = bar.current?.offsetWidth ?? 0;
      const h = bar.current?.offsetHeight ?? 40;
      const left = Math.min(
        Math.max(block.left + block.width / 2 - w / 2, bounds.left + GAP),
        Math.max(bounds.right - w - GAP, bounds.left + GAP),
      );
      const above = block.top - h - GAP;
      const below = block.bottom + GAP;
      const top =
        above >= bounds.top + GAP
          ? above
          : below + h <= bounds.bottom - GAP
            ? below
            : bounds.top + GAP;
      setPlace({ left, top });
    };
    update();
    // Второй проход — уже с измеренной шириной панели.
    const again = requestAnimationFrame(update);
    editor.on('selectionUpdate', update);
    editor.on('update', update);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      cancelAnimationFrame(again);
      editor.off('selectionUpdate', update);
      editor.off('update', update);
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [editor]);

  /*
   * Кнопки возвращают фокус в текст — там стоит выделение. Поля ввода —
   * нет: иначе после первой цифры кегля фокус уходил в текст, и вторая
   * цифра печаталась в грамоту. Выделение хранится в состоянии редактора
   * и без фокуса, команда ложится на него же.
   */
  const setStyle = (patch: Record<string, unknown>, refocus = true) => {
    const chain = editor.chain();
    (refocus ? chain.focus() : chain).setMark('textStyle', { ...state.style, ...patch }).run();
  };
  const toggle = (name: string) => editor.chain().focus().toggleMark(name).run();

  const size = (state.style.fontSize as number | undefined) ?? base.fontSize;
  const align = state.align ?? base.align;
  const AlignIcon = ALIGNS.find(([value]) => value === align)?.[1] ?? AlignCenter;
  const moreActive =
    state.strike ||
    state.superscript ||
    state.subscript ||
    Boolean(state.style.transform || state.style.letterSpacing || state.style.fontWeight || state.style.background);

  return createPortal(
    <div
      ref={bar}
      data-rich-toolbar
      role="toolbar"
      aria-label="Оформление текста"
      className="fixed z-40 flex items-center gap-0.5 rounded-card bg-raised p-1 shadow-lg ring-1 ring-line"
      style={{ left: place?.left ?? -9999, top: place?.top ?? -9999 }}
      onPointerDown={(e) => {
        // Поля ввода фокус получают; всё остальное не уводит его из текста.
        if (!(e.target as HTMLElement).closest('input')) e.preventDefault();
      }}
    >
      <Select
        aria-label="Шрифт"
        value={(state.style.fontFamily as string) ?? ''}
        onChange={(fontFamily) => setStyle({ fontFamily: fontFamily || null })}
        options={[
          { value: '', label: base.fontFamily, group: 'Как у блока' },
          ...FONTS.map((f) => ({ value: f, label: f, group: 'Другой шрифт' })),
        ]}
        compact
        className="w-36 bg-transparent ring-0 hover:bg-sunken"
      />

      <div className="flex items-center">
        <Tool title="Меньше" onClick={() => setStyle({ fontSize: Math.max(4, size - 1) })}>
          <Minus size={16} />
        </Tool>
        <NumberField
          aria-label="Кегль, pt"
          min={4}
          max={200}
          step={0.5}
          placeholder={String(base.fontSize)}
          value={(state.style.fontSize as number | undefined) ?? ''}
          onChange={(raw) => setStyle({ fontSize: raw ? Number(raw) : null }, false)}
          compact
          className="w-14 [&_input]:px-1 [&_input]:text-center"
        />
        <Tool title="Больше" onClick={() => setStyle({ fontSize: Math.min(200, size + 1) })}>
          <Plus size={16} />
        </Tool>
      </div>

      <Divider />

      <Tool active={state.bold} title="Полужирный (Ctrl+B)" onClick={() => toggle('bold')}>
        <Bold size={16} />
      </Tool>
      <Tool active={state.italic} title="Курсив (Ctrl+I)" onClick={() => toggle('italic')}>
        <Italic size={16} />
      </Tool>
      <Tool active={state.underline} title="Подчёркнутый (Ctrl+U)" onClick={() => toggle('underline')}>
        <Underline size={16} />
      </Tool>
      <ColorPicker
        letter
        label="Цвет текста"
        value={(state.style.color as string) ?? base.color}
        onChange={(color) => setStyle({ color }, false)}
      />

      <Divider />

      <Menu
        title="Выравнивание и списки"
        active={state.bullet || state.ordered}
        width={232}
        label={
          <>
            <AlignIcon size={16} />
            <ChevronDown size={16} />
          </>
        }
      >
        <div className="flex items-center gap-0.5 p-1">
          {ALIGNS.map(([value, Icon, title]) => (
            <Tool
              key={value}
              active={align === value}
              title={title}
              onClick={() =>
                editor
                  .chain()
                  .focus()
                  .updateAttributes('paragraph', { align: value === base.align ? null : value })
                  .run()
              }
            >
              <Icon size={16} />
            </Tool>
          ))}
          <Divider />
          <Tool
            active={state.bullet}
            title="Маркированный список"
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          >
            <List size={16} />
          </Tool>
          <Tool
            active={state.ordered}
            title="Нумерованный список"
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          >
            <ListOrdered size={16} />
          </Tool>
        </div>
      </Menu>

      <Menu
        title="Ещё: индексы, регистр, разрядка"
        active={moreActive}
        width={248}
        label={
          <>
            <CaseSensitive size={16} />
            <ChevronDown size={16} />
          </>
        }
      >
        <div className="space-y-2 p-2">
          <div className="flex items-center gap-0.5">
            <Tool active={state.strike} title="Зачёркнутый" onClick={() => toggle('strike')}>
              <Strikethrough size={16} />
            </Tool>
            <Tool
              active={state.superscript}
              title="Верхний индекс"
              onClick={() => editor.chain().focus().toggleSuperscript().run()}
            >
              <Superscript size={16} />
            </Tool>
            <Tool
              active={state.subscript}
              title="Нижний индекс"
              onClick={() => editor.chain().focus().toggleSubscript().run()}
            >
              <Subscript size={16} />
            </Tool>
          </div>
          <Row label="Подложка">
            <div className="flex items-center gap-1">
              {Boolean(state.style.background) && (
                <Tool title="Убрать подложку" onClick={() => setStyle({ background: null })}>
                  <X size={16} />
                </Tool>
              )}
              <ColorPicker
                compact
                label="Цвет подложки"
                value={(state.style.background as string) ?? '#ffffff'}
                onChange={(background) => setStyle({ background }, false)}
              />
            </div>
          </Row>
          <Row label="Регистр">
            <Select
              aria-label="Регистр"
              value={(state.style.transform as string) ?? ''}
              onChange={(transform) => setStyle({ transform: transform || null })}
              options={[
                { value: '', label: 'Как есть' },
                { value: 'uppercase', label: 'ПРОПИСНЫЕ' },
                { value: 'lowercase', label: 'строчные' },
                { value: 'smallcaps', label: 'Капитель' },
              ]}
              className="h-8 w-32 px-2 py-0 text-sm"
            />
          </Row>
          <Row label="Насыщенность">
            <Select
              aria-label="Насыщенность"
              value={String(state.style.fontWeight ?? '')}
              onChange={(weight) => setStyle({ fontWeight: weight ? Number(weight) : null })}
              options={[
                { value: '', label: 'Как у блока' },
                ...WEIGHTS.map((w) => ({ value: String(w), label: String(w) })),
              ]}
              className="h-8 w-32 px-2 py-0 text-sm"
            />
          </Row>
          <Row label="Разрядка, pt">
            <NumberField
              aria-label="Разрядка, pt"
              min={-5}
              max={30}
              step={0.25}
              placeholder="0"
              value={(state.style.letterSpacing as number | undefined) ?? ''}
              onChange={(raw) => setStyle({ letterSpacing: raw ? Number(raw) : null }, false)}
              compact
              className="w-32"
            />
          </Row>
        </div>
      </Menu>

      <Divider />

      <Tool
        title="Вставить поле (или наберите @)"
        onClick={() => editor.chain().focus().insertContent('@').run()}
        disabled={fields.length === 0}
      >
        <AtSign size={16} />
      </Tool>
      <LinkMenu editor={editor} active={state.link} href={state.linkHref} />
    </div>,
    document.body,
  );
}

/**
 * Ссылка на выделенном тексте — полем под кнопкой, а не системным
 * окошком браузера. Адрес может быть с полем — «https://…/verify/{{code}}»,
 * оно подставится при печати.
 */
function LinkMenu({ editor, active, href }: { editor: Editor; active: boolean; href: string }) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  const apply = (close: () => void) => {
    const trimmed = draft.trim();
    if (!trimmed) {
      editor.chain().focus().unsetMark('link').run();
      close();
      return;
    }
    if (!isSafeHrefTemplate(trimmed)) {
      setError('Адрес начинается с http:// или https://');
      return;
    }
    editor.chain().focus().setMark('link', { href: trimmed }).run();
    close();
  };

  return (
    <Menu
      title={active ? 'Изменить ссылку' : 'Ссылка'}
      active={active}
      width={300}
      onOpen={() => {
        setDraft(href || 'https://');
        setError(null);
      }}
      label={<Link2 size={16} />}
    >
      {(close) => (
        <form
          className="space-y-2 p-2"
          onSubmit={(e) => {
            e.preventDefault();
            apply(close);
          }}
        >
          <Input
            compact
            autoFocus
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setError(null);
            }}
            placeholder="https://example.ru/{{code}}"
            aria-label="Адрес ссылки"
          />
          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex justify-end gap-1">
            {active && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  editor.chain().focus().unsetMark('link').run();
                  close();
                }}
              >
                Убрать
              </Button>
            )}
            <Button type="submit" size="sm" variant="primary">
              Готово
            </Button>
          </div>
        </form>
      )}
    </Menu>
  );
}

/**
 * Кнопка панели со своим всплывающим слоем.
 *
 * Закрывается нажатием мимо — но не нажатием в другой слой: внутри лежат
 * список и выбор цвета, и их слои висят отдельно, в body. Проверка
 * «мимо ли» по одному этому слою закрыла бы его первым же выбором цвета.
 */
function Menu({
  title,
  label,
  active = false,
  width = 'auto' as const,
  onOpen,
  children,
}: {
  title: string;
  label: React.ReactNode;
  active?: boolean;
  width?: number | 'auto';
  onOpen?: () => void;
  children: React.ReactNode | ((close: () => void) => React.ReactNode);
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const close = () => setOpen(false);
  useDismissOutsideLayers(open, close, trigger, panel);

  return (
    <>
      <Tool
        ref={trigger}
        title={title}
        active={active || open}
        wide
        onClick={() => {
          if (!open) onOpen?.();
          setOpen((v) => !v);
        }}
      >
        {label}
      </Tool>
      <Popover open={open} anchor={trigger} panelRef={panel} role="dialog" width={width === 'auto' ? undefined : width}>
        {typeof children === 'function' ? children(close) : children}
      </Popover>
    </>
  );
}

function useDismissOutsideLayers(
  open: boolean,
  onClose: () => void,
  trigger: RefObject<HTMLElement | null>,
  panel: RefObject<HTMLElement | null>,
) {
  const latest = useRef(onClose);
  latest.current = onClose;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement;
      if (trigger.current?.contains(target) || panel.current?.contains(target)) return;
      if (target.closest('[data-ui-popover]')) return;
      latest.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Гасим: иначе тот же Escape закончил бы и правку текста.
      e.stopPropagation();
      latest.current();
    };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open, trigger, panel]);
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-muted">{label}</span>
      {children}
    </div>
  );
}

function Divider() {
  return <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-line" />;
}

function Tool({
  ref,
  active = false,
  title,
  onClick,
  disabled,
  wide,
  children,
}: {
  ref?: React.Ref<HTMLButtonElement>;
  active?: boolean;
  title: string;
  onClick: () => void;
  disabled?: boolean;
  /** Кнопка со стрелкой открытия — чуть шире обычной. */
  wide?: boolean;
  children: React.ReactNode;
}) {
  const { triggerProps, tooltip } = useTooltip(title);

  return (
    <button
      ref={ref}
      type="button"
      {...triggerProps}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`pressable flex h-8 shrink-0 items-center justify-center gap-0.5 rounded-control disabled:cursor-not-allowed disabled:opacity-50 ${
        wide ? 'px-1.5' : 'w-8'
      } ${active ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-sunken hover:text-ink'}`}
    >
      {children}
      {tooltip}
    </button>
  );
}
