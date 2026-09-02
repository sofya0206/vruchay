// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import { mergeField, paragraph, richDoc, textRun, type RichDoc } from '@gramota/shared';
import { editorExtensions } from './extensions';

/**
 * Живой редактор и схема хранения — одно и то же дерево.
 *
 * Это и есть гарантия «холст = печать» со стороны редактора: TipTap
 * отдаёт `getJSON()`, разбор `richDoc` его принимает без единого
 * преобразования, и печать рисует ровно то, что человек только что
 * набрал. Если какой-то узел или марка не переживают круг, это видно
 * здесь, а не на бумаге.
 */

// В jsdom нет ClipboardEvent, а вставка ProseMirror его создаёт.
if (typeof globalThis.ClipboardEvent === 'undefined') {
  (globalThis as { ClipboardEvent?: unknown }).ClipboardEvent = class extends Event {
    clipboardData = null;
  };
}

function editorWith(doc: RichDoc): Editor {
  return new Editor({ extensions: editorExtensions(), content: doc });
}

/** Нажатие клавиши — той же дорогой, что и в браузере: через handleKeyDown. */
function press(editor: Editor, key: string): boolean {
  const view = editor.view;
  const event = new KeyboardEvent('keydown', { key, code: key });
  return Boolean(view.someProp('handleKeyDown', (f) => f(view, event)));
}

function roundTrip(doc: RichDoc): RichDoc {
  const editor = editorWith(doc);
  const json = editor.getJSON();
  editor.destroy();
  return richDoc.parse(json);
}

describe('круг схема → редактор → схема', () => {
  it('абзацы с текстом и полями', () => {
    const doc: RichDoc = {
      type: 'doc',
      content: [
        paragraph([textRun('Награждается '), mergeField('name', { fieldId: 'c1', fallback: 'участник', format: 'upper' })]),
        paragraph([textRun('за '), mergeField('place_word'), textRun(' место')], { align: 'right', indent: 1 }),
      ],
    };
    expect(roundTrip(doc)).toEqual(doc);
  });

  it('все марки схемы', () => {
    const doc: RichDoc = {
      type: 'doc',
      content: [
        paragraph([
          textRun('ж', { type: 'bold' }),
          textRun('к', { type: 'italic' }),
          textRun('п', { type: 'underline' }),
          textRun('з', { type: 'strike' }),
          textRun('2', { type: 'superscript' }),
          textRun('i', { type: 'subscript' }),
          textRun('с', {
            type: 'textStyle',
            attrs: {
              color: '#aa0000',
              background: '#ffff00',
              fontFamily: 'Lora',
              fontSize: 30,
              fontWeight: 600,
              letterSpacing: 1.5,
              wordSpacing: 2,
              transform: 'smallcaps',
            },
          }),
        ]),
      ],
    };
    const back = roundTrip(doc);
    const marks = (back.content[0] as { content: { marks?: unknown[] }[] }).content.map((n) => n.marks);
    expect(marks.map((m) => (m as { type: string }[])[0].type)).toEqual([
      'bold', 'italic', 'underline', 'strike', 'superscript', 'subscript', 'textStyle',
    ]);
    expect(marks[6]).toEqual([
      {
        type: 'textStyle',
        attrs: {
          color: '#aa0000',
          background: '#ffff00',
          fontFamily: 'Lora',
          fontSize: 30,
          fontWeight: 600,
          letterSpacing: 1.5,
          wordSpacing: 2,
          transform: 'smallcaps',
        },
      },
    ]);
  });

  it('списки с маркерами, нумерацией, галочками и вложенностью', () => {
    const doc: RichDoc = {
      type: 'doc',
      content: [
        {
          type: 'orderedList',
          attrs: { numbering: 'lower-alpha', start: 3 },
          content: [
            { type: 'listItem', attrs: { checked: null }, content: [paragraph([textRun('первое')])] },
            {
              type: 'listItem',
              attrs: { checked: null },
              content: [
                paragraph([textRun('второе')]),
                {
                  type: 'bulletList',
                  attrs: { marker: 'dash' },
                  content: [
                    { type: 'listItem', attrs: { checked: true }, content: [paragraph([textRun('сделано')])] },
                    { type: 'listItem', attrs: { checked: false }, content: [paragraph([textRun('нет')])] },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    expect(roundTrip(doc)).toEqual(doc);
  });

  it('перевод строки внутри абзаца', () => {
    const doc: RichDoc = {
      type: 'doc',
      content: [paragraph([textRun('первая'), { type: 'hardBreak' }, textRun('вторая')])],
    };
    expect(roundTrip(doc)).toEqual(doc);
  });
});

describe('поле в редакторе', () => {
  it('копируется в буфер как {{name}}', () => {
    const editor = editorWith({
      type: 'doc',
      content: [paragraph([textRun('Имя: '), mergeField('name')])],
    });
    expect(editor.getText()).toBe('Имя: {{name}}');
    editor.destroy();
  });

  it('вставка {{name}} и %name из буфера становится полем', () => {
    const editor = editorWith({ type: 'doc', content: [paragraph([])] });
    // insertContent правила вставки не запускает — идём через логику
    // вставки самого ProseMirror, как при настоящем Ctrl+V текста.
    editor.view.pasteText('Дата {{date}}, имя %name');
    const json = richDoc.parse(editor.getJSON());
    const fields: string[] = [];
    for (const block of json.content) {
      if (block.type !== 'paragraph') continue;
      for (const node of block.content) if (node.type === 'mergeField') fields.push(node.attrs.source);
    }
    expect(fields).toEqual(['date', 'name']);
    editor.destroy();
  });

  it('поле — целый узел: у него нет половины, Backspace сначала выделяет', () => {
    const editor = editorWith({
      type: 'doc',
      content: [paragraph([textRun('a'), mergeField('name'), textRun('b')])],
    });
    // Позиции: 1 — перед «a», 2 — перед полем, 3 — после поля, 4 — после «b».
    expect(editor.state.doc.nodeAt(2)?.type.name).toBe('mergeField');
    expect(editor.state.doc.nodeAt(2)?.isAtom).toBe(true);
    // Внутри узла позиции нет: следующая за 2 текстовая позиция — 3.
    expect(editor.state.doc.resolve(3).nodeBefore?.type.name).toBe('mergeField');

    // Backspace при каретке после узла — выделение узла, не удаление.
    editor.commands.setTextSelection(3);
    expect(press(editor, 'Backspace')).toBe(true);
    expect(editor.state.selection.constructor.name).toBe('NodeSelection');
    expect(editor.getText()).toContain('{{name}}');
    expect(press(editor, 'Backspace')).toBe(true);
    expect(editor.getText()).not.toContain('{{name}}');

    // И Delete перед полем — так же: сначала выделение.
    editor.commands.setContent({ type: 'doc', content: [paragraph([textRun('a'), mergeField('name')])] });
    editor.commands.setTextSelection(2);
    expect(press(editor, 'Delete')).toBe(true);
    expect(editor.state.selection.constructor.name).toBe('NodeSelection');
    editor.destroy();
  });
});

describe('оформление на лету', () => {
  it('**жирный** при наборе становится маркой', () => {
    const editor = editorWith({ type: 'doc', content: [paragraph([])] });
    for (const char of '**жирный**') editor.commands.insertContent(char);
    // Правила ввода срабатывают на текстовом вводе; проверяем через getJSON
    // после эмуляции: insertContent их не дёргает, поэтому шлём как ввод.
    editor.commands.clearContent();
    const view = editor.view;
    view.dispatch(view.state.tr.insertText('**жирный*'));
    const at = view.state.selection.from;
    view.someProp('handleTextInput', (f) => f(view, at, at, '*', () => view.state.tr.insertText('*', at, at)));
    const json = editor.getJSON();
    const text = JSON.stringify(json);
    expect(text).toContain('"type":"bold"');
    expect(text).not.toContain('**');
    editor.destroy();
  });
});
