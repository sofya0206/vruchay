import { createPortal } from 'react-dom';
import { Extension } from '@tiptap/core';
import Suggestion, { type SuggestionProps, type SuggestionKeyDownProps } from '@tiptap/suggestion';
import type { FieldInfo } from '../fields';

/**
 * Набор «@» в тексте — список полей с поиском.
 *
 * Это второй путь вставки поля, для тех, кто печатает не отрываясь;
 * первый — панель полей и автосопоставление. Ищет по названию и по
 * ключу: «@имя» и «@name» находят одно и то же.
 */

export interface SuggestionState {
  items: FieldInfo[];
  index: number;
  rect: DOMRect | null;
  command: (item: FieldInfo) => void;
}

export interface FieldSuggestionOptions {
  fields: () => FieldInfo[];
  onState: (state: SuggestionState | null) => void;
}

function filterFields(fields: FieldInfo[], query: string): FieldInfo[] {
  const q = query.trim().toLocaleLowerCase('ru-RU');
  if (!q) return fields.slice(0, 12);
  return fields
    .filter(
      (f) =>
        f.title.toLocaleLowerCase('ru-RU').includes(q) ||
        f.source.toLocaleLowerCase('ru-RU').includes(q),
    )
    .slice(0, 12);
}

export const FieldSuggestion = Extension.create<FieldSuggestionOptions>({
  name: 'fieldSuggestion',

  addOptions() {
    return { fields: () => [], onState: () => {} };
  },

  addProseMirrorPlugins() {
    const { fields, onState } = this.options;

    return [
      Suggestion<FieldInfo, FieldInfo>({
        editor: this.editor,
        char: '@',
        allowSpaces: false,
        items: ({ query }) => filterFields(fields(), query),
        command: ({ editor, range, props }) => {
          editor
            .chain()
            .focus()
            .insertContentAt(range, [
              { type: 'mergeField', attrs: { source: props.source, fieldId: props.fieldId } },
              { type: 'text', text: ' ' },
            ])
            .run();
        },
        render: () => {
          let index = 0;
          let current: SuggestionProps<FieldInfo, FieldInfo> | null = null;

          const publish = () => {
            if (!current) return onState(null);
            onState({
              items: current.items,
              index,
              rect: current.clientRect?.() ?? null,
              command: (item) => current?.command(item),
            });
          };

          return {
            onStart: (props) => {
              current = props;
              index = 0;
              publish();
            },
            onUpdate: (props) => {
              current = props;
              index = Math.min(index, Math.max(props.items.length - 1, 0));
              publish();
            },
            onKeyDown: (props: SuggestionKeyDownProps) => {
              if (!current || current.items.length === 0) return false;
              if (props.event.key === 'ArrowDown') {
                index = (index + 1) % current.items.length;
                publish();
                return true;
              }
              if (props.event.key === 'ArrowUp') {
                index = (index - 1 + current.items.length) % current.items.length;
                publish();
                return true;
              }
              if (props.event.key === 'Enter' || props.event.key === 'Tab') {
                current.command(current.items[index]);
                return true;
              }
              if (props.event.key === 'Escape') {
                onState(null);
                return true;
              }
              return false;
            },
            onExit: () => {
              current = null;
              onState(null);
            },
          };
        },
      }),
    ];
  },
});

/** Список под кареткой. В теле документа: холст масштабирован, а координаты — экранные. */
export function SuggestionList({ state }: { state: SuggestionState | null }) {
  if (!state || !state.rect) return null;
  const { rect, items, index, command } = state;

  return createPortal(
    <div
      role="listbox"
      className="fixed z-50 w-72 rounded-xl bg-[var(--surface)] py-1 shadow-lg ring-1 ring-[var(--line)]"
      style={{ left: rect.left, top: rect.bottom + 4 }}
      onPointerDown={(e) => e.preventDefault()}
    >
      {items.length === 0 ? (
        <p className="px-3 py-2 text-sm text-[var(--text-muted)]">Ничего похожего</p>
      ) : (
        items.map((item, i) => (
          <button
            key={item.source}
            type="button"
            role="option"
            aria-selected={i === index}
            onClick={() => command(item)}
            className={`flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-sm ${
              i === index ? 'bg-[var(--accent-soft)]' : 'hover:bg-[var(--surface-sunken)]'
            }`}
          >
            <span>{item.title}</span>
            <span className="text-xs text-[var(--text-muted)]">{item.hint}</span>
          </button>
        ))
      )}
    </div>,
    document.body,
  );
}
