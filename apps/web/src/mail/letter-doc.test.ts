import { describe, expect, it } from 'vitest';
import { getSchema, type JSONContent } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { MergeField } from '../editor/rich/extensions';
import { toHtml } from './email-body';
import { docToLetter, letterToDoc } from './letter-doc';
import { DEFAULT_LETTER } from './letter-defaults';

/*
 * Письмо хранится текстом с `%ключ`, а правится фишками. Перевод идёт
 * на каждом открытии и каждом нажатии клавиши: ошибка в нём тихо испортит
 * письмо, и заметит это только получатель.
 */

const field = (source: string, marks?: JSONContent['marks']): JSONContent => ({
  type: 'mergeField',
  attrs: { source },
  ...(marks ? { marks } : {}),
});
const text = (value: string, marks?: JSONContent['marks']): JSONContent => ({
  type: 'text',
  text: value,
  ...(marks ? { marks } : {}),
});
const bold = [{ type: 'bold' }];
const italic = [{ type: 'italic' }];
const doc = (...paragraphs: JSONContent[][]): JSONContent => ({
  type: 'doc',
  content: paragraphs.map((content) => (content.length ? { type: 'paragraph', content } : { type: 'paragraph' })),
});

describe('текст письма → фишки', () => {
  it('поле становится фишкой', () => {
    expect(letterToDoc('Здравствуйте, %name!', true)).toEqual(
      doc([text('Здравствуйте, '), field('name'), text('!')]),
    );
  });

  it('абзацы, переносы и начертания — узлами редактора', () => {
    expect(letterToDoc('*Поздравляем*, %name!\nУра\n\n_С уважением_', true)).toEqual(
      doc(
        [text('Поздравляем', bold), text(', '), field('name'), text('!'), { type: 'hardBreak' }, text('Ура')],
        [text('С уважением', italic)],
      ),
    );
  });

  it('поле внутри полужирного — полужирная фишка', () => {
    expect(letterToDoc('*%name*', true)).toEqual(doc([field('name', bold)]));
  });

  it('тема — одна строка: переносы становятся пробелами, звёздочки — текстом', () => {
    expect(letterToDoc('Ваш *документ*,\n%name', false)).toEqual(
      doc([text('Ваш *документ*, '), field('name')]),
    );
  });

  it('пустой текст — пустой абзац, а не пустой документ', () => {
    expect(letterToDoc('', true)).toEqual(doc([]));
    expect(letterToDoc('', false)).toEqual(doc([]));
  });

  it('дерево подходит схеме редактора', () => {
    const schema = getSchema([StarterKit, MergeField]);
    expect(() => schema.nodeFromJSON(letterToDoc(DEFAULT_LETTER.body, true)).check()).not.toThrow();
  });
});

describe('фишки → текст письма', () => {
  it('письмо по умолчанию проходит круг без потерь', () => {
    expect(docToLetter(letterToDoc(DEFAULT_LETTER.body, true))).toBe(DEFAULT_LETTER.body);
    expect(docToLetter(letterToDoc(DEFAULT_LETTER.subject, false))).toBe(DEFAULT_LETTER.subject);
  });

  it('начертания и переносы проходят круг без потерь', () => {
    const letter = '*Поздравляем*, %name!\nУра\n\n_С уважением_, %org_name';
    expect(docToLetter(letterToDoc(letter, true))).toBe(letter);
  });

  it('соседние куски одного начертания — одной парой знаков', () => {
    // «*Привет, **%name*» разбор понял бы иначе, чем показывал редактор.
    const letter = docToLetter(doc([text('Привет, ', bold), field('name', bold), text('!')]));
    expect(letter).toBe('*Привет, %name*!');
    expect(toHtml(letter)).toBe('<p><b>Привет, %name</b>!</p>');
  });

  it('поле не сливается с латиницей и цифрами после него', () => {
    // «%place» + «1» — это уже поле «place1», которого нет.
    expect(docToLetter(doc([field('place'), text('1 место')]))).toBe('%place 1 место');
    expect(docToLetter(doc([field('place'), text(' место')]))).toBe('%place место');
    expect(docToLetter(doc([field('place'), text('-е место')]))).toBe('%place-е место');
    expect(docToLetter(doc([field('name'), text('курс', italic)]))).toBe('%name _курс_');
  });

  it('поле сразу за полем', () => {
    expect(docToLetter(doc([field('last_name'), field('first_name')]))).toBe('%last_name%first_name');
  });

  it('пустая строка между абзацами — разделитель', () => {
    expect(docToLetter(doc([text('Первый')], [text('Второй')]))).toBe('Первый\n\nВторой');
  });
});
