import { useLayoutEffect, useState } from 'react';
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
  Italic,
  List,
  ListOrdered,
  Strikethrough,
  Subscript,
  Superscript,
  Underline,
} from 'lucide-react';
import type { TextProps } from '@gramota/shared';
import type { FieldInfo } from '../fields';
import { FONTS, WEIGHTS } from '../fonts-list';

/**
 * Панель оформления над правящимся блоком.
 *
 * Здесь то, что относится к выделенному куску текста: начертание, кегль,
 * цвет, индексы, списки, поле. Всё, что относится к блоку целиком,
 * остаётся в панели свойств справа — иначе одно и то же свойство
 * жило бы в двух местах и спорило само с собой.
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
  const [rect, setRect] = useState<DOMRect | null>(null);

  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      superscript: e.isActive('superscript'),
      subscript: e.isActive('subscript'),
      bullet: e.isActive('bulletList'),
      ordered: e.isActive('orderedList'),
      align: (e.getAttributes('paragraph').align as string | null) ?? null,
      style: e.getAttributes('textStyle') as Record<string, unknown>,
    }),
  });

  useLayoutEffect(() => {
    const update = () => setRect(editor.view.dom.getBoundingClientRect());
    update();
    editor.on('selectionUpdate', update);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      editor.off('selectionUpdate', update);
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [editor]);

  if (!rect) return null;

  const setStyle = (patch: Record<string, unknown>) =>
    editor.chain().focus().setMark('textStyle', { ...state.style, ...patch }).run();

  const toggle = (name: string) => editor.chain().focus().toggleMark(name).run();

  const top = Math.max(8, rect.top - 46);

  return createPortal(
    <div
      data-rich-toolbar
      role="toolbar"
      aria-label="Оформление текста"
      className="fixed z-40 flex flex-wrap items-center gap-1 rounded-xl bg-[var(--surface)] p-1 shadow-lg ring-1 ring-[var(--line)]"
      style={{ left: Math.max(8, rect.left), top }}
      onPointerDown={(e) => e.preventDefault()}
    >
      <select
        aria-label="Гарнитура"
        value={(state.style.fontFamily as string) ?? ''}
        onChange={(e) => setStyle({ fontFamily: e.target.value || null })}
        className="h-8 rounded-md bg-transparent px-1 text-sm ring-1 ring-[var(--line)]"
      >
        <option value="">Как у блока ({base.fontFamily})</option>
        {FONTS.map((f) => (
          <option key={f} value={f}>
            {f}
          </option>
        ))}
      </select>

      <input
        aria-label="Кегль, pt"
        type="number"
        min={4}
        max={200}
        step={0.5}
        placeholder={String(base.fontSize)}
        value={(state.style.fontSize as number | undefined) ?? ''}
        onChange={(e) => setStyle({ fontSize: e.target.value ? Number(e.target.value) : null })}
        className="tabular h-8 w-16 rounded-md bg-transparent px-1 text-sm ring-1 ring-[var(--line)]"
      />

      <select
        aria-label="Насыщенность"
        value={(state.style.fontWeight as number | undefined) ?? ''}
        onChange={(e) => setStyle({ fontWeight: e.target.value ? Number(e.target.value) : null })}
        className="h-8 rounded-md bg-transparent px-1 text-sm ring-1 ring-[var(--line)]"
      >
        <option value="">Вес</option>
        {WEIGHTS.map((w) => (
          <option key={w} value={w}>
            {w}
          </option>
        ))}
      </select>

      <Tool active={state.bold} title="Полужирный (Ctrl+B)" onClick={() => toggle('bold')}>
        <Bold size={15} />
      </Tool>
      <Tool active={state.italic} title="Курсив (Ctrl+I)" onClick={() => toggle('italic')}>
        <Italic size={15} />
      </Tool>
      <Tool active={state.underline} title="Подчёркнутый (Ctrl+U)" onClick={() => toggle('underline')}>
        <Underline size={15} />
      </Tool>
      <Tool active={state.strike} title="Зачёркнутый" onClick={() => toggle('strike')}>
        <Strikethrough size={15} />
      </Tool>
      <Tool
        active={state.superscript}
        title="Верхний индекс"
        onClick={() => editor.chain().focus().toggleSuperscript().run()}
      >
        <Superscript size={15} />
      </Tool>
      <Tool
        active={state.subscript}
        title="Нижний индекс"
        onClick={() => editor.chain().focus().toggleSubscript().run()}
      >
        <Subscript size={15} />
      </Tool>

      <input
        aria-label="Цвет текста"
        type="color"
        value={(state.style.color as string) ?? base.color}
        onChange={(e) => setStyle({ color: e.target.value })}
        className="h-8 w-8 cursor-pointer rounded-md bg-transparent"
        title="Цвет текста"
      />
      <input
        aria-label="Цвет подложки"
        type="color"
        value={(state.style.background as string) ?? '#ffffff'}
        onChange={(e) => setStyle({ background: e.target.value })}
        className="h-8 w-8 cursor-pointer rounded-md bg-transparent"
        title="Подложка под буквами"
      />

      <span className="mx-0.5 h-6 w-px bg-[var(--line)]" />

      {(
        [
          ['left', AlignLeft, 'По левому краю (Ctrl+L)'],
          ['center', AlignCenter, 'По центру (Ctrl+E)'],
          ['right', AlignRight, 'По правому краю (Ctrl+R)'],
          ['justify', AlignJustify, 'По ширине'],
        ] as const
      ).map(([value, Icon, title]) => (
        <Tool
          key={value}
          active={(state.align ?? base.align) === value}
          title={title}
          onClick={() =>
            editor
              .chain()
              .focus()
              .updateAttributes('paragraph', { align: value === base.align ? null : value })
              .run()
          }
        >
          <Icon size={15} />
        </Tool>
      ))}

      <Tool
        active={state.bullet}
        title="Маркированный список"
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <List size={15} />
      </Tool>
      <Tool
        active={state.ordered}
        title="Нумерованный список"
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered size={15} />
      </Tool>

      <span className="mx-0.5 h-6 w-px bg-[var(--line)]" />

      <select
        aria-label="Регистр"
        value={(state.style.transform as string) ?? ''}
        onChange={(e) => setStyle({ transform: e.target.value || null })}
        className="h-8 rounded-md bg-transparent px-1 text-sm ring-1 ring-[var(--line)]"
      >
        <option value="">Регистр</option>
        <option value="uppercase">ПРОПИСНЫЕ</option>
        <option value="lowercase">строчные</option>
        <option value="smallcaps">Капитель</option>
      </select>

      <input
        aria-label="Разрядка, pt"
        type="number"
        min={-5}
        max={30}
        step={0.25}
        placeholder="разрядка"
        value={(state.style.letterSpacing as number | undefined) ?? ''}
        onChange={(e) =>
          setStyle({ letterSpacing: e.target.value ? Number(e.target.value) : null })
        }
        className="tabular h-8 w-20 rounded-md bg-transparent px-1 text-sm ring-1 ring-[var(--line)]"
        title="Межбуквенное расстояние"
      />

      <Tool
        active={false}
        title="Вставить поле (или наберите @)"
        onClick={() => editor.chain().focus().insertContent('@').run()}
        disabled={fields.length === 0}
      >
        <AtSign size={15} />
      </Tool>
    </div>,
    document.body,
  );
}

function Tool({
  active,
  title,
  onClick,
  disabled,
  children,
}: {
  active: boolean;
  title: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`grid h-8 w-8 place-items-center rounded-md transition-colors disabled:opacity-40 ${
        active
          ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
          : 'text-[var(--text-muted)] hover:bg-[var(--surface-sunken)]'
      }`}
    >
      {children}
    </button>
  );
}
