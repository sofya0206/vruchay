import { describe, expect, it } from 'vitest';
import { sheetLayout, type SheetLayout } from '@gramota/shared';
import {
  alignBoxes,
  boundingBox,
  commonTextProps,
  distributeBoxes,
  expandToGroups,
  marqueeSelect,
  MIXED,
  moveGroup,
  moveLayer,
  rectFromPoints,
  reorderLayers,
  rotationFromPointer,
  scaleGroup,
  snapBox,
  snapCandidates,
  snapToGrid,
} from './selection';

const PAGE = { w: 297, h: 210 };

function layout(): SheetLayout {
  return sheetLayout.parse([
    { id: 'a', type: 'text', x: 10, y: 10, w: 50, h: 10, z: 0, props: { text: 'a' } },
    { id: 'b', type: 'text', x: 100, y: 50, w: 40, h: 20, z: 1, props: { text: 'b', bold: true } },
    { id: 'c', type: 'text', x: 200, y: 100, w: 30, h: 30, z: 2, props: { text: 'c' } },
    { id: 'h', type: 'text', x: 0, y: 0, w: 297, h: 210, z: 3, hidden: true, props: { text: 'h' } },
  ]);
}

describe('рамка выделения', () => {
  it('берёт всё, что пересекает рамку, кроме скрытых', () => {
    const marquee = rectFromPoints(120, 60, 5, 5);
    expect(marqueeSelect(layout(), marquee)).toEqual(['a', 'b']);
  });

  it('рамка в любую сторону — одна и та же', () => {
    expect(rectFromPoints(10, 10, 0, 0)).toEqual(rectFromPoints(0, 0, 10, 10));
  });

  it('группа выделяется целиком', () => {
    const grouped = layout().map((el) => (el.id === 'a' || el.id === 'c' ? { ...el, groupId: 'g' } : el));
    expect([...expandToGroups(grouped, ['a'])].sort()).toEqual(['a', 'c']);
  });
});

describe('выравнивание группы', () => {
  const boxes = [
    { x: 10, y: 10, w: 50, h: 10 },
    { x: 100, y: 50, w: 40, h: 20 },
  ];
  const frame = boundingBox(boxes)!;

  it('общая рамка', () => {
    expect(frame).toEqual({ x: 10, y: 10, w: 130, h: 60 });
  });

  it('по левому, правому краю и центру', () => {
    expect(alignBoxes(boxes, 'left', frame).map((b) => b.x)).toEqual([10, 10]);
    expect(alignBoxes(boxes, 'right', frame).map((b) => b.x)).toEqual([90, 100]);
    expect(alignBoxes(boxes, 'hcenter', frame).map((b) => b.x)).toEqual([50, 55]);
    expect(alignBoxes(boxes, 'bottom', frame).map((b) => b.y)).toEqual([60, 50]);
  });

  it('один блок выравнивается по листу', () => {
    const page = { x: 0, y: 0, ...PAGE };
    expect(alignBoxes([boxes[0]], 'hcenter', page)[0].x).toBe(123.5);
  });

  it('распределение делает промежутки равными, крайние на месте', () => {
    const three = [
      { x: 0, y: 0, w: 10, h: 10 },
      { x: 12, y: 0, w: 10, h: 10 },
      { x: 90, y: 0, w: 10, h: 10 },
    ];
    const out = distributeBoxes(three, 'h');
    expect(out.map((b) => b.x)).toEqual([0, 45, 90]);
  });
});

describe('масштаб группы', () => {
  const boxes = [
    { x: 10, y: 10, w: 50, h: 10 },
    { x: 10, y: 30, w: 100, h: 20 },
  ];
  const frame = boundingBox(boxes)!;

  it('пропорции и расстояния сохраняются, противоположный угол на месте', () => {
    const { boxes: out, scale } = scaleGroup(boxes, frame, 'se', 100, 0, PAGE);
    expect(scale).toBeCloseTo(2, 6);
    expect(out[0]).toEqual({ x: 10, y: 10, w: 100, h: 20 });
    expect(out[1]).toEqual({ x: 10, y: 50, w: 200, h: 40 });
  });

  it('не уводит группу за лист', () => {
    const { scale } = scaleGroup(boxes, frame, 'se', 10_000, 0, PAGE);
    const out = scaleGroup(boxes, frame, 'se', 10_000, 0, PAGE).boxes;
    expect(scale).toBeLessThan(3);
    for (const b of out) {
      expect(b.x + b.w).toBeLessThanOrEqual(PAGE.w + 1e-9);
      expect(b.y + b.h).toBeLessThanOrEqual(PAGE.h + 1e-9);
    }
  });

  it('не схлопывает самую маленькую коробку ниже минимума', () => {
    const { boxes: out } = scaleGroup(boxes, frame, 'se', -1000, -1000, PAGE);
    expect(Math.min(...out.map((b) => Math.min(b.w, b.h)))).toBeGreaterThanOrEqual(5 - 1e-9);
  });

  it('сдвиг группы упирается в край листа целиком', () => {
    const moved = moveGroup(boxes, -1000, 0, PAGE);
    expect(moved[0].x).toBe(0);
    expect(moved[1].x).toBe(0);
  });
});

describe('прилипание', () => {
  it('край блока прилипает к краю соседа, центр — к центру листа', () => {
    const lines = snapCandidates(layout(), new Set(['a']), PAGE);
    // Левый край 99 → к левому краю «b» (100).
    const nearEdge = snapBox({ x: 99, y: 80, w: 20, h: 10 }, lines);
    expect(nearEdge.box.x).toBe(100);
    expect(nearEdge.active.some((l) => l.axis === 'x' && l.at === 100)).toBe(true);
    // Центр 148 → к центру листа 148,5.
    const nearCenter = snapBox({ x: 138, y: 150, w: 20, h: 10 }, lines);
    expect(nearCenter.box.x + 10).toBe(148.5);
  });

  it('дальше порога не прилипает', () => {
    const lines = snapCandidates(layout(), new Set(['a']), PAGE);
    const far = snapBox({ x: 70, y: 150, w: 20, h: 10 }, lines);
    expect(far.box.x).toBe(70);
    expect(far.active.filter((l) => l.axis === 'x')).toEqual([]);
  });

  it('скрытые и сами двигаемые блоки направляющих не дают', () => {
    const lines = snapCandidates(layout(), new Set(['a']), PAGE);
    expect(lines.some((l) => l.kind !== 'page' && l.axis === 'x' && l.at === 10)).toBe(false);
  });

  it('сетка округляет к шагу', () => {
    expect(snapToGrid({ x: 11.4, y: 12.6, w: 24, h: 3 }, 5)).toEqual({ x: 10, y: 15, w: 25, h: 5 });
  });
});

describe('слои', () => {
  it('переставляет по списку сверху вниз', () => {
    const out = reorderLayers(layout(), ['a', 'c', 'b', 'h']);
    const z = Object.fromEntries(out.map((el) => [el.id, el.z]));
    expect(z).toEqual({ a: 3, c: 2, b: 1, h: 0 });
  });

  it('на шаг вверх, на самый верх, вниз', () => {
    const z = (l: SheetLayout, id: string) => l.find((el) => el.id === id)!.z;
    expect(z(moveLayer(layout(), 'a', 'top'), 'a')).toBe(3);
    expect(z(moveLayer(layout(), 'c', 'bottom'), 'c')).toBe(0);
    const up = moveLayer(layout(), 'a', 'up');
    expect(z(up, 'a')).toBeGreaterThan(z(up, 'b'));
  });
});

describe('общие свойства', () => {
  it('одинаковое — значением, разное — «смешанное»', () => {
    const common = commonTextProps(layout().slice(0, 2));
    expect(common.fontFamily).toBe('PT Sans');
    expect(common.bold).toBe(MIXED);
    expect('doc' in common).toBe(false);
  });
});

describe('поворот', () => {
  it('курсор справа от центра — четверть оборота, с шагом — к ближайшему', () => {
    expect(rotationFromPointer({ x: 0, y: 0 }, { x: 10, y: 0 }, null)).toBe(90);
    expect(rotationFromPointer({ x: 0, y: 0 }, { x: 10, y: 1 }, 15)).toBe(90);
    expect(rotationFromPointer({ x: 0, y: 0 }, { x: 0, y: -10 }, null)).toBe(0);
  });
});
