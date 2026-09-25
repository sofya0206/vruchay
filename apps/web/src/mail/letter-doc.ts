import type { Editor, JSONContent } from '@tiptap/core';
import { parseBody } from './email-body';

/**
 * Перевод между текстом письма и деревом редактора.
 *
 * В базе письмо лежит как раньше — текстом с `%ключ`, `*полужирным*`
 * и `_курсивом_`: этот формат понимают сервер и уже сохранённые письма.
 * На экране вместо него — фишки полей и настоящее начертание, чтобы
 * человеку не приходилось ни помнить знак процента, ни видеть звёздочки.
 */

const FIELD_RE = /%([a-zA-Z][a-zA-Z0-9_]*)/g;
/** Знаки, которые продолжили бы ключ поля: `%place` + «1» = `%place1`. */
const KEY_CHAR = /^[A-Za-z0-9_]/;

type LetterMark = 'bold' | 'italic';

function inline(text: string, mark?: LetterMark): JSONContent[] {
  const marks = mark ? { marks: [{ type: mark }] } : {};
  const out: JSONContent[] = [];
  let last = 0;
  for (const m of text.matchAll(FIELD_RE)) {
    if (m.index > last) out.push({ type: 'text', text: text.slice(last, m.index), ...marks });
    out.push({ type: 'mergeField', attrs: { source: m[1] }, ...marks });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ type: 'text', text: text.slice(last), ...marks });
  return out;
}

function paragraph(content: JSONContent[]): JSONContent {
  return content.length ? { type: 'paragraph', content } : { type: 'paragraph' };
}

/** Текст письма → дерево. Тема — одна строка без начертаний. */
export function letterToDoc(text: string, multiline: boolean): JSONContent {
  if (!multiline) {
    return { type: 'doc', content: [paragraph(inline(text.replace(/\s*[\r\n]+\s*/g, ' ')))] };
  }
  const paragraphs = parseBody(text).map((runs) =>
    paragraph(
      runs.flatMap((run) => {
        if (run.kind === 'break') return [{ type: 'hardBreak' }];
        if (run.kind === 'bold' || run.kind === 'italic') return inline(run.text, run.kind);
        return inline(run.text);
      }),
    ),
  );
  return { type: 'doc', content: paragraphs.length ? paragraphs : [paragraph([])] };
}

function markOf(node: JSONContent): LetterMark | null {
  const types = node.marks?.map((m) => m.type) ?? [];
  if (types.includes('bold')) return 'bold';
  if (types.includes('italic')) return 'italic';
  return null;
}

/** Склейка кусков, при которой поле не сливается с буквами после него. */
class Writer {
  text = '';
  private afterField = false;

  push(piece: string, isField = false) {
    if (!piece) return;
    if (this.afterField && KEY_CHAR.test(piece)) this.text += ' ';
    this.text += piece;
    this.afterField = isField;
  }
}

function paragraphToText(nodes: JSONContent[]): string {
  const out = new Writer();
  let segment = new Writer();
  let segmentMark: LetterMark | null = null;
  let segmentEndsWithField = false;

  // Подряд идущие куски с одним начертанием — одной парой знаков:
  // «*Иван *» + «*%name*» дало бы «**», которое разбор не поймёт.
  const flush = () => {
    if (!segment.text) return;
    const wrap = segmentMark === 'bold' ? '*' : segmentMark === 'italic' ? '_' : '';
    out.push(wrap + segment.text + wrap, !wrap && segmentEndsWithField);
    segment = new Writer();
  };

  for (const node of nodes) {
    if (node.type === 'hardBreak') {
      flush();
      segmentMark = null;
      out.push('\n');
      continue;
    }
    const mark = markOf(node);
    if (mark !== segmentMark) {
      flush();
      segmentMark = mark;
    }
    const isField = node.type === 'mergeField';
    segment.push(isField ? `%${node.attrs?.source}` : (node.text ?? ''), isField);
    segmentEndsWithField = isField;
  }
  flush();
  return out.text;
}

/** Дерево → текст письма. Абзацы — через пустую строку, как в поле ввода раньше. */
export function docToLetter(doc: JSONContent): string {
  return (doc.content ?? []).map((p) => paragraphToText(p.content ?? [])).join('\n\n');
}

/**
 * Полужирный и курсив в письме не сочетаются: разметка `*…*` и `_…_`
 * не вкладывается, и сочетание молча потеряло бы одно из двух.
 */
export function toggleLetterMark(editor: Editor, mark: LetterMark): boolean {
  const other = mark === 'bold' ? 'italic' : 'bold';
  return editor.chain().focus().unsetMark(other).toggleMark(mark).run();
}
