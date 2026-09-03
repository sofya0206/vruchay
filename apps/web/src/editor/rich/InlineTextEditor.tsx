import { useEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import type { Editor } from '@tiptap/core';
import { richDoc, type RichDoc, type TextElement } from '@gramota/shared';
import type { FieldInfo } from '../fields';
import { editorExtensions } from './extensions';
import { FieldContext } from './MergeFieldView';
import { FieldPopover } from './FieldPopover';
import { FieldSuggestion, SuggestionList, type SuggestionState } from './FieldSuggestion';
import { FormatToolbar } from './FormatToolbar';
import { looksLikeMarkdown, markdownToHtml } from './markdown';

/**
 * Живой редактор одного блока — на месте, поверх его статичного вида.
 *
 * Появляется по двойному клику и живёт, пока блок правят. Стили блока
 * (шрифт, кегль, выравнивание) он не задаёт — их даёт тот же контейнер,
 * что и статичному виду, и потому текст не прыгает при входе в правку.
 *
 * Дерево уходит наружу на каждое изменение, но без записи в историю
 * листа: пока блок правят, Ctrl+Z откатывает буквы внутри него силами
 * TipTap. В историю листа попадает один шаг — по выходу из правки.
 */
export interface InlineTextEditorProps {
  element: TextElement;
  fields: FieldInfo[];
  data: Record<string, string>;
  known: ReadonlySet<string> | null;
  labels: Record<string, string>;
  /** Живой экземпляр редактора — панели полей, чтобы вставлять в каретку. */
  onEditor?: (editor: Editor | null) => void;
  /** Изменение дерева — без записи в историю. */
  onChange: (doc: RichDoc) => void;
  /** Выход из правки: последнее дерево и просьба записать шаг в историю. */
  onDone: (doc: RichDoc) => void;
  /** Куда деть каретку при входе: в конец либо в позицию. */
  focusAt?: 'end' | number;
}

export function InlineTextEditor({
  element,
  fields,
  data,
  known,
  labels,
  onEditor,
  onChange,
  onDone,
  focusAt = 'end',
}: InlineTextEditorProps) {
  const [suggestion, setSuggestion] = useState<SuggestionState | null>(null);
  const [fieldPos, setFieldPos] = useState<number | null>(null);
  const fieldsRef = useRef(fields);
  fieldsRef.current = fields;
  const latest = useRef<RichDoc>(element.props.doc);

  const editor = useEditor({
    extensions: [
      ...editorExtensions(),
      FieldSuggestion.configure({ fields: () => fieldsRef.current, onState: setSuggestion }),
    ],
    content: element.props.doc,
    autofocus: focusAt,
    editorProps: {
      attributes: { class: 'rich-editor', spellcheck: 'true' },
      /**
       * Вставка из чужого редактора: если в тексте видна разметка
       * Markdown, разбираем её; иначе вставляем как есть. Только для
       * текста без HTML — у HTML свой разбор в TipTap.
       */
      handlePaste: (view, event) => {
        const html = event.clipboardData?.getData('text/html');
        const text = event.clipboardData?.getData('text/plain') ?? '';
        if (html || !looksLikeMarkdown(text)) return false;
        editorRef.current?.commands.insertContent(markdownToHtml(text));
        return true;
      },
    },
    onUpdate: ({ editor: e }) => {
      const parsed = richDoc.safeParse(e.getJSON());
      if (!parsed.success) return;
      latest.current = parsed.data;
      onChange(parsed.data);
    },
  });

  const editorRef = useRef<Editor | null>(null);
  editorRef.current = editor;

  useEffect(() => {
    onEditor?.(editor);
    return () => onEditor?.(null);
  }, [editor, onEditor]);

  // Выход по Escape или по клику мимо — одним и тем же путём.
  useEffect(() => {
    if (!editor) return;
    const finish = () => onDone(latest.current);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !suggestion && fieldPos === null) {
        e.preventDefault();
        finish();
      }
    };
    const onBlur = () => {
      // Клик по фишке или по панели оформления тоже уводит фокус —
      // но это ещё правка, а не выход. Даём событию дойти до цели.
      setTimeout(() => {
        const active = document.activeElement;
        if (editor.isFocused) return;
        if (active?.closest('[data-rich-toolbar], [data-rich-popover]')) return;
        finish();
      }, 0);
    };
    editor.view.dom.addEventListener('keydown', onKey);
    editor.on('blur', onBlur);
    return () => {
      editor.view.dom.removeEventListener('keydown', onKey);
      editor.off('blur', onBlur);
    };
  }, [editor, onDone, suggestion, fieldPos]);

  const context = useMemo(
    () => ({ data, known, labels, onOpen: (pos: number) => setFieldPos(pos) }),
    [data, known, labels],
  );

  if (!editor) return null;

  const fieldLabel = (() => {
    if (fieldPos === null) return '';
    const node = editor.state.doc.nodeAt(fieldPos);
    const source = (node?.attrs as { source?: string } | undefined)?.source ?? '';
    return labels[source] ?? source;
  })();

  return (
    <FieldContext.Provider value={context}>
      <EditorContent editor={editor} style={{ width: '100%' }} />
      <FormatToolbar editor={editor} fields={fields} base={element.props} />
      <SuggestionList state={suggestion} />
      {fieldPos !== null && (
        <div data-rich-popover>
          <FieldPopover
            editor={editor}
            pos={fieldPos}
            label={fieldLabel}
            onClose={() => {
              setFieldPos(null);
              editor.commands.focus();
            }}
          />
        </div>
      )}
    </FieldContext.Provider>
  );
}
