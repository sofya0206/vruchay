import { describe, expect, it } from 'vitest';
import { sheetLayout } from '@gramota/shared';
import { backgroundDpi, overflowingIds, resizeLayout } from './page-fit';

/**
 * Подстройка макета под другой лист.
 *
 * Проверяется то, что обещано человеку в диалоге: «пропорционально» держит
 * композицию, «только положения» не трогает кегли, «ничего не трогать»
 * честно называет вылезшие блоки.
 */

const A4L = { w: 297, h: 210 };
const A5L = { w: 210, h: 148 };

function layout() {
  return sheetLayout.parse([
    {
      id: 'name',
      type: 'text',
      x: 48.5,
      y: 80,
      w: 200,
      h: 20,
      props: {
        doc: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Иванов', marks: [{ type: 'textStyle', attrs: { fontSize: 40 } }] }],
            },
          ],
        },
        fontSize: 30,
        letterSpacing: 1,
        padding: 2,
        borderWidth: 0.5,
      },
    },
    { id: 'line', type: 'shape', x: 20, y: 180, w: 100, h: 2, props: { kind: 'line', strokeWidth: 1 } },
    { id: 'qr', type: 'qr', x: 250, y: 160, w: 30, h: 30, props: {} },
  ]);
}

describe('пропорционально', () => {
  it('все величины умножаются на один коэффициент, композиция встаёт по центру', () => {
    const k = A5L.h / A4L.h; // по высоте лист уже: 148/210
    const { layout: out, overflowing } = resizeLayout(layout(), A4L, A5L, 'scale');
    const name = out[0];
    if (name.type !== 'text') throw new Error('не текст');
    // Коэффициент — меньший из двух, композиция по центру по горизонтали.
    const offsetX = (A5L.w - A4L.w * k) / 2;
    expect(name.x).toBeCloseTo(offsetX + 48.5 * k, 1);
    expect(name.w).toBeCloseTo(200 * k, 1);
    expect(name.props.fontSize).toBeCloseTo(30 * k, 1);
    expect(name.props.letterSpacing).toBeCloseTo(1 * k, 1);
    expect(name.props.padding).toBeCloseTo(2 * k, 1);
    // Кегль в марке тоже в той же пропорции.
    const block = name.props.doc.content[0];
    if (block.type !== 'paragraph') throw new Error('не абзац');
    const mark = block.content[0].marks?.[0];
    expect(mark?.type === 'textStyle' && mark.attrs.fontSize).toBeCloseTo(40 * k, 1);
    expect(overflowing).toEqual([]);
  });

  it('обводка фигуры тоже масштабируется', () => {
    const { layout: out } = resizeLayout(layout(), A4L, { w: 594, h: 420 }, 'scale');
    const line = out[1];
    if (line.type !== 'shape') throw new Error('не фигура');
    expect(line.props.strokeWidth).toBeCloseTo(2, 6);
  });
});

describe('только положения', () => {
  it('кегль и размеры прежние, центр блока — на той же доле листа', () => {
    const { layout: out } = resizeLayout(layout(), A4L, A5L, 'reposition');
    const name = out[0];
    if (name.type !== 'text') throw new Error('не текст');
    expect(name.props.fontSize).toBe(30);
    expect(name.w).toBe(200);
    const cxBefore = (48.5 + 100) / A4L.w;
    const cxAfter = (name.x + 100) / A5L.w;
    expect(cxAfter).toBeCloseTo(cxBefore, 6);
  });

  it('блок шире нового листа упирается в край и называется вылезшим', () => {
    const A6L = { w: 148, h: 105 };
    const { layout: out, overflowing } = resizeLayout(layout(), A4L, A6L, 'reposition');
    expect(out[0].x).toBe(0);
    expect(overflowing).toEqual(['name']);
  });
});

describe('ничего не трогать', () => {
  it('макет тот же, вылезшие блоки перечислены', () => {
    const source = layout();
    const { layout: out, overflowing } = resizeLayout(source, A4L, A5L, 'keep');
    expect(out).toBe(source);
    // Линия на 180 мм тоже ниже края A5 (148 мм).
    expect(overflowing.sort()).toEqual(['line', 'name', 'qr']);
  });

  it('overflowingIds: блок в пределах листа не считается', () => {
    expect(overflowingIds(layout(), A4L)).toEqual([]);
  });
});

describe('разрешение фона', () => {
  it('точек на дюйм — по худшей из сторон', () => {
    // 3508×2480 на A4 альбомный — ровно 300 dpi.
    expect(backgroundDpi({ width: 3508, height: 2480 }, A4L)).toBe(300);
    expect(backgroundDpi({ width: 1200, height: 2480 }, A4L)).toBe(103);
  });
});
