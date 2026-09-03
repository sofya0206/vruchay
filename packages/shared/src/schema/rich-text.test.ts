import { describe, expect, it } from 'vitest';
import { CURRENT_LAYOUT_SCHEMA_VERSION, extractVariables, sheetLayout } from './layout';
import { buildPreset } from './presets';
import {
  MAX_RICH_DEPTH,
  MAX_RICH_NODES,
  mergeField,
  paragraph,
  renameRichDocField,
  richDoc,
  richDocFieldNames,
  richDocFromPlainText,
  richDocIsEmpty,
  richDocToPlainText,
  textRun,
  type RichBlock,
  type RichDoc,
} from './rich-text';
import { resolveRichDoc, resolvedPlainText } from './rich-text-resolve';
import { hrefFieldNames, isSafeHrefTemplate, resolveHrefTemplate } from './rich-text';

/**
 * Старый макет — ровно такой, каким его сохранил редактор до этой ветки:
 * плоский текст с «%name», один стиль на весь блок. Такие лежат в базе
 * у живых клиентов, и после правки они обязаны открываться и печататься
 * без потерь.
 */
const LEGACY_ELEMENT = {
  id: 'preset-award-1',
  type: 'text',
  x: 44.55,
  y: 80.1,
  w: 207.9,
  h: 19.3,
  rotation: 0,
  z: 1,
  props: {
    text: 'Награждается %name\nза %place_word место · %event',
    fontFamily: 'Playfair Display',
    fontSize: 42.3,
    color: '#8a2e2e',
    align: 'center',
    lineHeight: 1.15,
    letterSpacing: 0,
    bold: false,
    italic: true,
    underline: false,
    uppercase: false,
    strokeWidth: 0,
    strokeColor: '#ffffff',
    autoFit: true,
  },
};

describe('переход старого макета на дерево', () => {
  it('версия схемы поднята', () => {
    expect(CURRENT_LAYOUT_SCHEMA_VERSION).toBe(2);
  });

  it('старый текстовый блок читается и получает дерево', () => {
    const [el] = sheetLayout.parse([LEGACY_ELEMENT]);
    if (el.type !== 'text') throw new Error('не текст');

    expect('text' in el.props).toBe(false);
    expect(el.props.doc.content).toHaveLength(2);
    expect(el.props.doc.content[0]).toEqual(
      paragraph([textRun('Награждается '), mergeField('name')]),
    );
    expect(el.props.doc.content[1]).toEqual(
      paragraph([
        textRun('за '),
        mergeField('place_word'),
        textRun(' место · '),
        mergeField('event'),
      ]),
    );
  });

  it('стили блока остаются на блоке — переход ничего не растаскивает по маркам', () => {
    const [el] = sheetLayout.parse([LEGACY_ELEMENT]);
    if (el.type !== 'text') throw new Error('не текст');
    expect(el.props).toMatchObject({
      fontFamily: 'Playfair Display',
      fontSize: 42.3,
      color: '#8a2e2e',
      italic: true,
      autoFit: true,
    });
    const marks: unknown[] = [];
    for (const block of el.props.doc.content) {
      if (block.type !== 'paragraph') continue;
      for (const node of block.content) if (node.marks) marks.push(...node.marks);
    }
    expect(marks).toEqual([]);
  });

  it('текст без потерь восстанавливается из дерева', () => {
    const [el] = sheetLayout.parse([LEGACY_ELEMENT]);
    if (el.type !== 'text') throw new Error('не текст');
    expect(richDocToPlainText(el.props.doc)).toBe(LEGACY_ELEMENT.props.text);
  });

  it('переменные старого блока находятся в дереве те же', () => {
    const layout = sheetLayout.parse([LEGACY_ELEMENT]);
    expect(extractVariables(layout).sort()).toEqual(['event', 'name', 'place_word']);
  });

  it('новые свойства блока получают умолчания и не ломают старый блок', () => {
    const [el] = sheetLayout.parse([LEGACY_ELEMENT]);
    expect(el).toMatchObject({ opacity: 1, locked: false, hidden: false, groupId: null });
    if (el.type !== 'text') throw new Error('не текст');
    expect(el.props).toMatchObject({ verticalAlign: 'middle', padding: 0, background: null });
  });

  it('заготовки строятся сразу в новом виде', () => {
    const layout = buildPreset('award', 'classic', {
      pageWidthMm: 297,
      pageHeightMm: 210,
      columns: ['name', 'place'],
    });
    for (const el of layout) {
      if (el.type !== 'text') continue;
      expect('text' in el.props).toBe(false);
      expect(el.props.doc.type).toBe('doc');
    }
    // И проходят разбор как есть — без обратного превращения.
    expect(() => sheetLayout.parse(layout)).not.toThrow();
  });

  it('блок без текста и без дерева не принимается', () => {
    expect(() =>
      sheetLayout.parse([{ ...LEGACY_ELEMENT, props: { fontFamily: 'PT Sans' } }]),
    ).toThrow();
  });

  it('текст и дерево вместе: дерево сильнее', () => {
    const doc: RichDoc = { type: 'doc', content: [paragraph([textRun('из дерева')])] };
    const [el] = sheetLayout.parse([
      { ...LEGACY_ELEMENT, props: { ...LEGACY_ELEMENT.props, doc } },
    ]);
    if (el.type !== 'text') throw new Error('не текст');
    expect(richDocToPlainText(el.props.doc)).toBe('из дерева');
  });
});

describe('дерево блока', () => {
  it('пустой текст даёт один пустой абзац', () => {
    const doc = richDocFromPlainText('');
    expect(doc.content).toEqual([paragraph([])]);
    expect(richDocIsEmpty(doc)).toBe(true);
  });

  it('пределы: слишком много узлов', () => {
    const content: RichBlock[] = Array.from({ length: MAX_RICH_NODES + 1 }, () => paragraph([]));
    expect(richDoc.safeParse({ type: 'doc', content }).success).toBe(false);
  });

  it('пределы: слишком глубокие списки', () => {
    let block: RichBlock = paragraph([textRun('дно')]);
    for (let i = 0; i < MAX_RICH_DEPTH + 1; i++) {
      block = {
        type: 'bulletList',
        attrs: { marker: 'disc' },
        content: [{ type: 'listItem', attrs: { checked: null }, content: [block] }],
      };
    }
    expect(richDoc.safeParse({ type: 'doc', content: [block] }).success).toBe(false);
  });

  it('имя поля — только латиница, цифры и подчёркивание', () => {
    const bad = { type: 'doc', content: [paragraph([mergeField('имя')])] };
    expect(richDoc.safeParse(bad).success).toBe(false);
    const good = { type: 'doc', content: [paragraph([mergeField('name_dat')])] };
    expect(richDoc.safeParse(good).success).toBe(true);
  });

  it('гарнитура — только буквы, цифры и пробел', () => {
    const el = {
      ...LEGACY_ELEMENT,
      props: { ...LEGACY_ELEMENT.props, fontFamily: 'x; url(evil)' },
    };
    expect(sheetLayout.safeParse([el]).success).toBe(false);
  });

  it('переименование колонки правит поля по идентификатору, а старые — по имени', () => {
    const doc: RichDoc = {
      type: 'doc',
      content: [
        paragraph([
          mergeField('name', { fieldId: 'col-1' }),
          textRun(', '),
          mergeField('name'),
          textRun(', '),
          mergeField('place', { fieldId: 'col-2' }),
        ]),
      ],
    };
    const renamed = renameRichDocField(doc, { fieldId: 'col-1', source: 'name' }, 'fio');
    expect(richDocFieldNames(renamed)).toEqual(['fio', 'place']);
    // Поле без идентификатора нашлось по имени и получило идентификатор.
    const fields = (renamed.content[0] as { content: unknown[] }).content;
    expect(fields[2]).toMatchObject({ attrs: { source: 'fio', fieldId: 'col-1' } });
  });
});

describe('подстановка в дерево', () => {
  const doc: RichDoc = {
    type: 'doc',
    content: [
      paragraph([textRun('Награждается '), mergeField('name'), textRun(', '), mergeField('position')]),
      paragraph([textRun('Должность: '), mergeField('position')]),
      paragraph([mergeField('position'), textRun(' · '), mergeField('team')]),
      paragraph([]),
      paragraph([textRun('Дата: '), mergeField('date')]),
    ],
  };

  it('на печати пустое поле исчезает вместе с разделителем, строка из одних полей — целиком', () => {
    const blocks = resolveRichDoc(doc, {
      data: { name: 'Иванов', date: '01.09.2026' },
      known: new Set(['name', 'position', 'team', 'date']),
      unfilled: 'blank',
    });
    // Строка с подписью «Должность:» остаётся: слова человека правило не трогает.
    expect(resolvedPlainText(blocks)).toBe(
      'Награждается Иванов\nДолжность: \n\nДата: 01.09.2026',
    );
  });

  it('пустая строка, оставленная человеком, не схлопывается', () => {
    const blocks = resolveRichDoc(doc, {
      data: { name: 'Иванов', position: 'тренер', date: '01.09.2026' },
      unfilled: 'blank',
    });
    expect(blocks).toHaveLength(5);
    expect(resolvedPlainText(blocks)).toBe(
      'Награждается Иванов, тренер\nДолжность: тренер\nтренер\n\nДата: 01.09.2026',
    );
  });

  it('на холсте ничего не исчезает — поле остаётся токеном', () => {
    const blocks = resolveRichDoc(doc, { data: { name: 'Иванов' }, unfilled: 'token' });
    expect(blocks).toHaveLength(5);
    expect(resolvedPlainText(blocks)).toContain('Награждается Иванов, %position');
  });

  it('запасной текст печатается вместо пустого значения', () => {
    const withFallback: RichDoc = {
      type: 'doc',
      content: [paragraph([mergeField('position', { fallback: 'участник' })])],
    };
    const blocks = resolveRichDoc(withFallback, { data: {}, unfilled: 'blank' });
    expect(resolvedPlainText(blocks)).toBe('участник');
    expect(blocks[0].content[0]).toMatchObject({ type: 'field', state: 'empty' });
  });

  it('различает «колонка пустая» и «колонки нет»', () => {
    const one: RichDoc = { type: 'doc', content: [paragraph([mergeField('position')])] };
    const known = new Set(['name']);
    const unknown = resolveRichDoc(one, { data: {}, known, unfilled: 'token' });
    expect(unknown[0].content[0]).toMatchObject({ state: 'unknown' });
    const empty = resolveRichDoc(one, { data: {}, known: new Set(['position']), unfilled: 'token' });
    expect(empty[0].content[0]).toMatchObject({ state: 'empty' });
  });

  it('регистр — оформлением поля, значение в данных не трогается', () => {
    const upper: RichDoc = {
      type: 'doc',
      content: [paragraph([mergeField('name', { format: 'upper' })])],
    };
    const data = { name: 'Иванов Пётр' };
    const blocks = resolveRichDoc(upper, { data, unfilled: 'blank' });
    expect(resolvedPlainText(blocks)).toBe('ИВАНОВ ПЁТР');
    expect(data.name).toBe('Иванов Пётр');
  });

  it('типографика правит значение, но не текст шаблона', () => {
    const d: RichDoc = {
      type: 'doc',
      content: [paragraph([textRun('Проходит в г. '), mergeField('city'), textRun(' - ежегодно')])],
    };
    const blocks = resolveRichDoc(d, { data: { city: 'г.Челябинск' }, unfilled: 'blank' });
    const text = resolvedPlainText(blocks);
    expect(text).toContain('г. Челябинск');
    // Дефис в тексте шаблона остался дефисом — так набрал человек.
    expect(text).toContain(' - ежегодно');
  });

  it('парные формы в тексте раскрываются по полу получателя', () => {
    const d: RichDoc = {
      type: 'doc',
      content: [paragraph([textRun('награждён(а) '), mergeField('name')])],
    };
    const blocks = resolveRichDoc(d, { data: { name: 'Иванова Мария Петровна' }, unfilled: 'blank' });
    expect(resolvedPlainText(blocks)).toBe('награждена Иванова Мария Петровна');
  });

  it('списки разворачиваются в строки с маркерами и отступами', () => {
    const list: RichDoc = {
      type: 'doc',
      content: [
        {
          type: 'orderedList',
          attrs: { numbering: 'lower-alpha', start: 1 },
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
                    { type: 'listItem', attrs: { checked: true }, content: [paragraph([textRun('вложенное')])] },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    const blocks = resolveRichDoc(list, { data: {}, unfilled: 'blank' });
    expect(blocks.map((b) => [b.marker, b.indent, resolvedPlainText([b])])).toEqual([
      ['а)', 1, 'а) первое'],
      ['б)', 1, 'б) второе'],
      ['☑', 2, '☑ вложенное'],
    ]);
  });
});

describe('адрес ссылки с полями', () => {
  it('годятся только http и https — и до, и после подстановки', () => {
    expect(isSafeHrefTemplate('https://vruchay.ru/verify/{{code}}')).toBe(true);
    expect(isSafeHrefTemplate('https://%site/x')).toBe(true);
    expect(isSafeHrefTemplate('javascript:alert(1)')).toBe(false);
    expect(isSafeHrefTemplate('data:text/html,x')).toBe(false);
    expect(isSafeHrefTemplate('vruchay.ru')).toBe(false);
  });

  it('перечисляет поля обеих записей', () => {
    expect(hrefFieldNames('https://x.ru/{{code}}?n=%number')).toEqual(['code', 'number']);
  });

  it('подставляет значения, кодируя их как части адреса', () => {
    expect(resolveHrefTemplate('https://x.ru/verify/{{code}}', { code: 'K7M2 9Q' })).toBe('https://x.ru/verify/K7M2%209Q');
    // Пустое значение хоста ломает адрес — ссылки не будет.
    expect(resolveHrefTemplate('https://{{site}}/x', {})).toBeNull();
    // Значение не может протащить свою схему.
    expect(resolveHrefTemplate('https://x.ru/{{p}}', { p: 'javascript:alert(1)' })).toBe('https://x.ru/javascript%3Aalert(1)');
  });

  it('в дереве ссылка подставляется на печати и остаётся шаблоном на холсте', () => {
    const doc: RichDoc = {
      type: 'doc',
      content: [paragraph([textRun('сайт', { type: 'link', attrs: { href: 'https://x.ru/{{code}}', underline: true } })])],
    };
    const printed = resolveRichDoc(doc, { data: { code: 'abc' }, unfilled: 'blank' });
    expect(printed[0].content[0]).toMatchObject({ marks: [{ type: 'link', attrs: { href: 'https://x.ru/abc' } }] });
    const canvas = resolveRichDoc(doc, { data: { code: 'abc' }, unfilled: 'token' });
    expect(canvas[0].content[0]).toMatchObject({ marks: [{ type: 'link', attrs: { href: 'https://x.ru/{{code}}' } }] });
    // Пустое поле в хосте — ссылка снимается, текст остаётся.
    const broken = resolveRichDoc(
      { type: 'doc', content: [paragraph([textRun('сайт', { type: 'link', attrs: { href: 'https://{{site}}/', underline: true } })])] },
      { data: {}, unfilled: 'blank' },
    );
    expect(broken[0].content[0]).toEqual({ type: 'text', text: 'сайт', marks: undefined });
  });
});
