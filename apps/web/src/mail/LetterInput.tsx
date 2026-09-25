import { useEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import { Extension, Node, type Editor } from '@tiptap/core';
import { Slice } from '@tiptap/pm/model';
import StarterKit from '@tiptap/starter-kit';
import { MergeField } from '../editor/rich/extensions';
import { FieldContext } from '../editor/rich/MergeFieldView';
import { FieldSuggestion, SuggestionList, type SuggestionState } from '../editor/rich/FieldSuggestion';
import type { FieldInfo } from '../editor/fields';
import { control } from '../ui/Field';
import { cn } from '../ui/cn';
import { docToLetter, letterToDoc, toggleLetterMark } from './letter-doc';

/** Тема письма — ровно одна строка. */
const SingleLineDoc = Node.create({ name: 'doc', topNode: true, content: 'paragraph' });

const SingleLineKeys = Extension.create({
  name: 'singleLineKeys',
  addKeyboardShortcuts: () => ({ Enter: () => true, 'Shift-Enter': () => true }),
});

/** Горячие клавиши начертаний — тоже без сочетания полужирного с курсивом. */
const ExclusiveMarks = Extension.create({
  name: 'exclusiveMarks',
  priority: 1000,
  addKeyboardShortcuts() {
    return {
      'Mod-b': () => toggleLetterMark(this.editor, 'bold'),
      'Mod-i': () => toggleLetterMark(this.editor, 'italic'),
    };
  },
});

export interface LetterInputProps {
  /** Текст при появлении поля. Дальше поле живёт своим содержимым. */
  initialValue: string;
  onChange: (text: string) => void;
  multiline: boolean;
  fields: FieldInfo[];
  /** Ключ → как назвать в фишке. */
  labels: Record<string, string>;
  /** Какие колонки есть; `null` — сравнивать не с чем, таблицы ещё нет. */
  known: ReadonlySet<string> | null;
  onFocus?: () => void;
  onEditor?: (editor: Editor | null) => void;
  placeholder?: string;
  ariaLabel: string;
}

/**
 * Поле письма, в котором подставляемые данные — фишки, а не `%ключ`.
 *
 * Вставляют их из панели «Данные» или набрав «@» — так же, как на листе.
 * Фишка подписана названием колонки: «Здравствуйте, [Фамилия и имя]!»
 * читается как письмо, а «Здравствуйте, %name!» — как код.
 */
export function LetterInput({
  initialValue,
  onChange,
  multiline,
  fields,
  labels,
  known,
  onFocus,
  onEditor,
  placeholder,
  ariaLabel,
}: LetterInputProps) {
  const [suggestion, setSuggestion] = useState<SuggestionState | null>(null);
  const [empty, setEmpty] = useState(!initialValue.trim());
  const fieldsRef = useRef(fields);
  fieldsRef.current = fields;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onFocusRef = useRef(onFocus);
  onFocusRef.current = onFocus;

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        blockquote: false,
        bulletList: false,
        code: false,
        codeBlock: false,
        heading: false,
        horizontalRule: false,
        listItem: false,
        listKeymap: false,
        orderedList: false,
        strike: false,
        underline: false,
        link: false,
        trailingNode: false,
        ...(multiline ? {} : { document: false, hardBreak: false, bold: false, italic: false }),
      }),
      ...(multiline ? [ExclusiveMarks] : [SingleLineDoc, SingleLineKeys]),
      MergeField,
      FieldSuggestion.configure({ fields: () => fieldsRef.current, onState: setSuggestion }),
    ],
    content: letterToDoc(initialValue, multiline),
    editorProps: {
      attributes: {
        class: 'rich-editor',
        'aria-label': ariaLabel,
        'aria-multiline': String(multiline),
        role: 'textbox',
        spellcheck: 'true',
      },
      // Вставленный текст разбирается тем же путём, что и сохранённое письмо:
      // `%ключ` сразу фишкой, пустая строка — абзацем, одиночный перенос — переносом.
      clipboardTextParser: (text, _context, _plain, view) => {
        const doc = view.state.schema.nodeFromJSON(letterToDoc(text, multiline));
        return new Slice(doc.content, 1, 1);
      },
    },
    onUpdate: ({ editor: e }) => {
      setEmpty(e.isEmpty);
      onChangeRef.current(docToLetter(e.getJSON()));
    },
    onFocus: () => onFocusRef.current?.(),
  });

  useEffect(() => {
    onEditor?.(editor);
    return () => onEditor?.(null);
  }, [editor, onEditor]);

  // В письме фишка показывает название колонки, а не значение из строки.
  const context = useMemo(() => ({ data: labels, known, labels, onOpen: () => {} }), [labels, known]);

  return (
    <FieldContext.Provider value={context}>
      <div
        className={cn(
          control,
          'relative h-auto cursor-text py-2 focus-within:ring-2 focus-within:ring-focus',
          multiline && 'min-h-48 text-base leading-relaxed [&_p+p]:mt-3',
        )}
        onClick={() => editor?.commands.focus()}
      >
        {empty && placeholder && (
          <span aria-hidden className="pointer-events-none absolute top-2 left-3 text-muted">
            {placeholder}
          </span>
        )}
        <EditorContent editor={editor} />
      </div>
      <SuggestionList state={suggestion} />
    </FieldContext.Provider>
  );
}
