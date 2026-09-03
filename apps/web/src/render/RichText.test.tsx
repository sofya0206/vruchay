import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  mergeField,
  paragraph,
  resolveRichDoc,
  sheetLayout,
  textRun,
  type RichDoc,
  type TextElement,
} from '@gramota/shared';
import { markStyle, RichText, runFace } from './RichText';
import { SheetRenderer } from './SheetRenderer';

/**
 * Рендер текста блока — одним компонентом на холст и на печать.
 *
 * Здесь проверяется то, что защищают тесты блока 10 со стороны разметки:
 * что печать и холст получают одну и ту же разметку для одного и того же
 * дерева, а различаются только фишками полей. И что старый макет — текст
 * строкой — печатается тем же текстом, что печатался.
 */

const LEGACY = {
  id: 'name',
  type: 'text',
  x: 10,
  y: 10,
  w: 100,
  h: 20,
  props: { text: 'Награждается %name\nза %place_word место', fontFamily: 'PT Serif', bold: true },
};

function textElement(doc: RichDoc, over: Record<string, unknown> = {}): TextElement {
  const [el] = sheetLayout.parse([{ ...LEGACY, props: { doc, fontFamily: 'PT Sans', ...over } }]);
  if (el.type !== 'text') throw new Error('не текст');
  return el;
}

function html(node: React.ReactElement): string {
  return renderToStaticMarkup(node);
}

const DATA = { name: 'Иванов Пётр', place_word: 'первое' };

describe('старый макет', () => {
  it('на печати даёт тот же текст, что и раньше', () => {
    const [el] = sheetLayout.parse([LEGACY]);
    const out = html(
      <SheetRenderer layout={[el]} pageWidthMm={297} pageHeightMm={210} data={DATA} />,
    );
    expect(out).toContain('Награждается ');
    expect(out).toContain('Иванов Пётр');
    expect(out).toContain('за ');
    expect(out).toContain('первое');
    expect(out).toContain(' место');
    // Ни фишек, ни токенов: на печати поле — обычный текст.
    expect(out).not.toContain('merge-chip');
    expect(out).not.toContain('%name');
  });

  it('стили блока попали в контейнер — как и прежде, на блок целиком', () => {
    const [el] = sheetLayout.parse([LEGACY]);
    const out = html(<SheetRenderer layout={[el]} pageWidthMm={297} pageHeightMm={210} data={DATA} />);
    expect(out).toContain('font-family:PT Serif');
    expect(out).toContain('font-weight:700');
    expect(out).toContain('white-space:pre-wrap');
  });
});

describe('холст и печать', () => {
  const doc: RichDoc = {
    type: 'doc',
    content: [
      paragraph([
        textRun('Награждается '),
        mergeField('name'),
        textRun(', '),
        textRun('тренер', { type: 'bold' }),
        textRun(' команды', { type: 'textStyle', attrs: { color: '#aa0000', fontSize: 30 } }),
      ]),
    ],
  };
  const el = textElement(doc);

  it('на холсте поле — фишка со значением, на печати — просто значение', () => {
    const canvas = html(
      <SheetRenderer layout={[el]} pageWidthMm={297} pageHeightMm={210} data={DATA} unfilled="token" />,
    );
    const print = html(
      <SheetRenderer layout={[el]} pageWidthMm={297} pageHeightMm={210} data={DATA} />,
    );
    expect(canvas).toContain('merge-chip chip-field');
    expect(canvas).toContain('data-field="name"');
    expect(print).not.toContain('merge-chip');
    expect(print).toContain('Иванов Пётр');

    // Всё остальное совпадает буквально: убираем фишку и сравниваем.
    const stripped = canvas.replace(/<span data-field[^>]*>Иванов Пётр<\/span>/, '<span>Иванов Пётр</span>');
    expect(stripped).toBe(print);
  });

  it('марки превращаются в CSS поверх стиля блока', () => {
    const out = html(<SheetRenderer layout={[el]} pageWidthMm={297} pageHeightMm={210} data={DATA} />);
    expect(out).toContain('<span style="font-weight:700">тренер</span>');
    expect(out).toContain('<span style="color:#aa0000;font-size:30pt"> команды</span>');
  });

  it('пустое поле на холсте — пунктирная фишка с запасным текстом', () => {
    const withFallback = textElement({
      type: 'doc',
      content: [paragraph([mergeField('position', { fallback: 'участник' })])],
    });
    const out = html(
      <SheetRenderer
        layout={[withFallback]}
        pageWidthMm={297}
        pageHeightMm={210}
        data={{}}
        unfilled="token"
        knownFields={new Set(['position'])}
      />,
    );
    expect(out).toContain('chip-empty');
    expect(out).toContain('>участник</span>');
  });

  it('пропавшая колонка — красная зачёркнутая фишка с объяснением', () => {
    const out = html(
      <SheetRenderer
        layout={[el]}
        pageWidthMm={297}
        pageHeightMm={210}
        data={{}}
        unfilled="token"
        knownFields={new Set(['email'])}
      />,
    );
    expect(out).toContain('chip-unknown');
    expect(out).toContain('не найдена');
  });

  it('служебное поле — своим оттенком', () => {
    const system = textElement({ type: 'doc', content: [paragraph([mergeField('date')])] });
    const out = html(
      <SheetRenderer layout={[system]} pageWidthMm={297} pageHeightMm={210} data={{ date: '01.09.2026' }} unfilled="token" />,
    );
    expect(out).toContain('chip-system');
  });

  it('скрытый блок не рисуется ни на холсте, ни на печати', () => {
    const hidden = { ...el, hidden: true };
    const out = html(<SheetRenderer layout={[hidden]} pageWidthMm={297} pageHeightMm={210} data={DATA} />);
    expect(out).not.toContain('Иванов');
  });
});

describe('оформление блока', () => {
  it('вертикальное выравнивание, отступ, рамка, заливка и тень — на контейнере', () => {
    const el = textElement(
      { type: 'doc', content: [paragraph([textRun('x')])] },
      { verticalAlign: 'top', padding: 2, borderWidth: 0.5, borderColor: '#123456', background: '#ffeecc', shadow: true },
    );
    const out = html(<SheetRenderer layout={[el]} pageWidthMm={297} pageHeightMm={210} />);
    expect(out).toContain('align-items:flex-start');
    expect(out).toContain('padding:2mm');
    expect(out).toContain('border:0.5mm solid #123456');
    expect(out).toContain('background-color:#ffeecc');
    expect(out).toContain('text-shadow');
  });

  it('списки — маркеры и отступы', () => {
    const el = textElement({
      type: 'doc',
      content: [
        {
          type: 'orderedList',
          attrs: { numbering: 'decimal-paren', start: 3 },
          content: [
            { type: 'listItem', attrs: { checked: null }, content: [paragraph([textRun('третье')])] },
            { type: 'listItem', attrs: { checked: null }, content: [paragraph([textRun('четвёртое')])] },
          ],
        },
      ],
    });
    const out = html(<SheetRenderer layout={[el]} pageWidthMm={297} pageHeightMm={210} />);
    expect(out).toContain('3)');
    expect(out).toContain('4)');
    expect(out).toContain('padding-left:6mm');
  });
});

describe('вспомогательные', () => {
  it('markStyle: подчёркивание и зачёркивание складываются', () => {
    expect(markStyle([{ type: 'underline' }, { type: 'strike' }])).toEqual({
      textDecoration: 'underline line-through',
    });
    expect(markStyle(undefined)).toEqual({});
  });

  it('runFace: марки перекрывают начертание блока', () => {
    const base = { fontFamily: 'PT Sans', bold: false, italic: false };
    expect(runFace(base, undefined)).toEqual({ family: 'PT Sans', weight: 400, style: 'normal' });
    expect(runFace(base, [{ type: 'bold' }, { type: 'italic' }])).toEqual({
      family: 'PT Sans',
      weight: 700,
      style: 'italic',
    });
    expect(
      runFace(base, [{ type: 'textStyle', attrs: { fontFamily: 'Lora', fontWeight: 600 } }]),
    ).toEqual({ family: 'Lora', weight: 600, style: 'normal' });
  });

  it('RichText не ломается на пустом дереве', () => {
    const el = textElement({ type: 'doc', content: [paragraph([])] });
    const blocks = resolveRichDoc(el.props.doc, { data: {}, unfilled: 'blank' });
    expect(() => html(<RichText blocks={blocks} base={el.props} fields="value" />)).not.toThrow();
  });
});

describe('ссылки — то, что станет аннотацией в PDF', () => {
  it('марка-ссылка печатается настоящим <a> с подставленным адресом', () => {
    const el = textElement({
      type: 'doc',
      content: [paragraph([textRun('проверить', { type: 'link', attrs: { href: 'https://x.ru/v/{{code}}', underline: false, color: '#1f5d3f' } })])],
    });
    const out = html(<SheetRenderer layout={[el]} pageWidthMm={297} pageHeightMm={210} data={{ code: 'K7M2' }} />);
    expect(out).toContain('<a href="https://x.ru/v/K7M2"');
    expect(out).toContain('color:#1f5d3f');
    expect(out).not.toContain('text-decoration:underline');
  });

  it('QR на печати обёрнут в ссылку на адрес проверки', () => {
    const [qr] = sheetLayout.parse([{ id: 'q', type: 'qr', x: 10, y: 10, w: 30, h: 30, props: {} }]);
    const out = html(<SheetRenderer layout={[qr]} pageWidthMm={297} pageHeightMm={210} verifyUrl="https://vruchay.ru/verify/abc" />);
    expect(out).toContain('<a href="https://vruchay.ru/verify/abc"');
  });

  it('ссылка-область: поля в адресе подставляются; сломанный адрес — без ссылки', () => {
    const [link] = sheetLayout.parse([
      { id: 'l', type: 'link', x: 10, y: 10, w: 30, h: 10, props: { url: 'https://x.ru/{{code}}' } },
    ]);
    const filled = html(<SheetRenderer layout={[link]} pageWidthMm={297} pageHeightMm={210} data={{ code: 'abc' }} />);
    expect(filled).toContain('href="https://x.ru/abc"');
    // Пустое поле в пути — адрес цел, ссылка ведёт на корень.
    const empty = html(<SheetRenderer layout={[link]} pageWidthMm={297} pageHeightMm={210} data={{}} />);
    expect(empty).toContain('href="https://x.ru/"');
    // Пустое поле в хосте — адреса не вышло, области без ссылки.
    const [hostLink] = sheetLayout.parse([
      { id: 'h', type: 'link', x: 10, y: 10, w: 30, h: 10, props: { url: 'https://{{site}}/x' } },
    ]);
    const broken = html(<SheetRenderer layout={[hostLink]} pageWidthMm={297} pageHeightMm={210} data={{}} />);
    expect(broken).not.toContain('href=');
  });
});
