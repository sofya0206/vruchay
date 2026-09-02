import type { SheetElement, SheetLayout, TextProps } from '@gramota/shared';
import { clamp, MIN_SIZE_MM, type Box, type ResizeHandle } from './geometry';

/**
 * Геометрия группы и инструменты холста — чистые функции.
 *
 * Здесь нет ни DOM, ни пикселей: всё в миллиметрах листа, как и сам макет.
 * Экран пересчитывает миллиметры в пиксели один раз, на границе жеста,
 * а всё остальное — рамка выделения, выравнивание, прилипание, масштаб
 * группы — проверяется тестами без браузера.
 *
 * Готовая библиотека перетаскивания (react-moveable лежала в зависимостях
 * без единого использования) для этого не взята намеренно: она меряет
 * DOM и не знает про миллиметры под масштабом холста, а проверить её
 * можно только глазами. Математики здесь на две сотни строк, и каждая
 * строка проверяется тестом.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function boundingBox(boxes: Rect[]): Rect | null {
  if (boxes.length === 0) return null;
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const b of boxes) {
    left = Math.min(left, b.x);
    top = Math.min(top, b.y);
    right = Math.max(right, b.x + b.w);
    bottom = Math.max(bottom, b.y + b.h);
  }
  return { x: left, y: top, w: right - left, h: bottom - top };
}

export function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** Рамка из двух точек — в любую сторону: тянуть можно и влево-вверх. */
export function rectFromPoints(x1: number, y1: number, x2: number, y2: number): Rect {
  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    w: Math.abs(x2 - x1),
    h: Math.abs(y2 - y1),
  };
}

/**
 * Что попадает в рамку выделения.
 *
 * Достаточно пересечения, а не полного попадания: так ведёт себя Figma,
 * и так проще зацепить длинную строку, выступающую за рамку. Скрытые
 * не выделяются — их нет на холсте; запертые выделяются, но не двигаются.
 */
export function marqueeSelect(layout: SheetLayout, marquee: Rect): string[] {
  return layout.filter((el) => !el.hidden && intersects(el, marquee)).map((el) => el.id);
}

/** Всё, что не скрыто, — для Ctrl+A. */
export function selectableIds(layout: SheetLayout): string[] {
  return layout.filter((el) => !el.hidden).map((el) => el.id);
}

/** Выделение с учётом групп: блок тянет за собой всех из своей группы. */
export function expandToGroups(layout: SheetLayout, ids: Iterable<string>): Set<string> {
  const out = new Set(ids);
  const groups = new Set<string>();
  for (const el of layout) if (out.has(el.id) && el.groupId) groups.add(el.groupId);
  for (const el of layout) if (el.groupId && groups.has(el.groupId) && !el.hidden) out.add(el.id);
  return out;
}

/* ───────────────────────────── выравнивание ───────────────────────────── */

export type AlignKind = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom';

/**
 * Выровнять коробки относительно рамки — общей для группы, либо листа
 * для одного блока: «по центру» одного блока значит по центру листа.
 */
export function alignBoxes(boxes: Rect[], kind: AlignKind, frame: Rect): Rect[] {
  return boxes.map((b) => {
    switch (kind) {
      case 'left':
        return { ...b, x: frame.x };
      case 'hcenter':
        return { ...b, x: frame.x + (frame.w - b.w) / 2 };
      case 'right':
        return { ...b, x: frame.x + frame.w - b.w };
      case 'top':
        return { ...b, y: frame.y };
      case 'vcenter':
        return { ...b, y: frame.y + (frame.h - b.h) / 2 };
      case 'bottom':
        return { ...b, y: frame.y + frame.h - b.h };
    }
  });
}

/**
 * Равномерно распределить: крайние остаются на месте, промежутки между
 * соседями делаются одинаковыми. Меньше трёх коробок распределять нечего.
 */
export function distributeBoxes(boxes: Rect[], axis: 'h' | 'v'): Rect[] {
  if (boxes.length < 3) return boxes;
  const key = axis === 'h' ? 'x' : 'y';
  const size = axis === 'h' ? 'w' : 'h';
  const order = boxes.map((b, i) => ({ b, i })).sort((p, q) => p.b[key] - q.b[key]);
  const first = order[0].b;
  const last = order[order.length - 1].b;
  const total = order.reduce((sum, { b }) => sum + b[size], 0);
  const span = last[key] + last[size] - first[key];
  const gap = (span - total) / (order.length - 1);

  const out = [...boxes];
  let cursor = first[key];
  for (const { b, i } of order) {
    out[i] = { ...b, [key]: cursor };
    cursor += b[size] + gap;
  }
  return out;
}

/* ─────────────────────────── масштаб группы ──────────────────────────── */

export interface GroupScale {
  boxes: Rect[];
  /** Во сколько раз изменилась группа — на столько же меняются кегли. */
  scale: number;
}

/**
 * Масштаб группы за угловую ручку — с сохранением пропорций.
 *
 * Противоположный угол общей рамки стоит на месте; каждая коробка
 * пересчитывается относительно него в той же пропорции, что и рамка.
 * Так композиция «имя + должность + подпись» уменьшается целиком, не
 * теряя ни расстояний, ни соотношения кеглей.
 */
export function scaleGroup(
  boxes: Rect[],
  frame: Rect,
  handle: ResizeHandle,
  deltaXMm: number,
  deltaYMm: number,
  page: { w: number; h: number },
): GroupScale {
  const grow = handle.includes('e') ? deltaXMm : handle.includes('w') ? -deltaXMm : 0;
  const growY = handle.includes('s') ? deltaYMm : handle.includes('n') ? -deltaYMm : 0;
  // По какой оси тянут сильнее — той и меряем масштаб.
  const byX = frame.w > 0 ? (frame.w + grow) / frame.w : 1;
  const byY = frame.h > 0 ? (frame.h + growY) / frame.h : 1;
  const wanted = Math.abs(grow) >= Math.abs(growY) ? byX : byY;

  // Не меньше минимального размера самой маленькой коробки и не за лист.
  const smallest = Math.min(...boxes.map((b) => Math.min(b.w, b.h)));
  const minScale = smallest > 0 ? MIN_SIZE_MM / smallest : 0.1;
  const anchorX = handle.includes('w') ? frame.x + frame.w : frame.x;
  const anchorY = handle.includes('n') ? frame.y + frame.h : frame.y;
  const maxScaleX = handle.includes('w') ? anchorX / frame.w : (page.w - anchorX) / frame.w;
  const maxScaleY = handle.includes('n') ? anchorY / frame.h : (page.h - anchorY) / frame.h;
  const scale = clamp(wanted, minScale, Math.max(minScale, Math.min(maxScaleX, maxScaleY)));

  return {
    scale,
    boxes: boxes.map((b) => ({
      x: anchorX + (b.x - anchorX) * scale,
      y: anchorY + (b.y - anchorY) * scale,
      w: b.w * scale,
      h: b.h * scale,
    })),
  };
}

/** Сдвиг группы целиком: ни одна коробка не выходит за лист. */
export function moveGroup(boxes: Rect[], dx: number, dy: number, page: { w: number; h: number }): Rect[] {
  const frame = boundingBox(boxes);
  if (!frame) return boxes;
  const safeDx = clamp(dx, -frame.x, Math.max(page.w - frame.w - frame.x, -frame.x));
  const safeDy = clamp(dy, -frame.y, Math.max(page.h - frame.h - frame.y, -frame.y));
  return boxes.map((b) => ({ ...b, x: b.x + safeDx, y: b.y + safeDy }));
}

/* ───────────────────────────── прилипание ────────────────────────────── */

export interface SnapLine {
  axis: 'x' | 'y';
  at: number;
  kind: 'edge' | 'center' | 'page';
}

/** Расстояние, ближе которого край прилипает к направляющей. */
export const SNAP_THRESHOLD_MM = 1.5;

/** Направляющие: края и центры листа и всех блоков, кроме двигаемых. */
export function snapCandidates(
  layout: SheetLayout,
  exclude: ReadonlySet<string>,
  page: { w: number; h: number },
): SnapLine[] {
  const lines: SnapLine[] = [
    { axis: 'x', at: 0, kind: 'page' },
    { axis: 'x', at: page.w / 2, kind: 'page' },
    { axis: 'x', at: page.w, kind: 'page' },
    { axis: 'y', at: 0, kind: 'page' },
    { axis: 'y', at: page.h / 2, kind: 'page' },
    { axis: 'y', at: page.h, kind: 'page' },
  ];
  for (const el of layout) {
    if (exclude.has(el.id) || el.hidden) continue;
    lines.push(
      { axis: 'x', at: el.x, kind: 'edge' },
      { axis: 'x', at: el.x + el.w / 2, kind: 'center' },
      { axis: 'x', at: el.x + el.w, kind: 'edge' },
      { axis: 'y', at: el.y, kind: 'edge' },
      { axis: 'y', at: el.y + el.h / 2, kind: 'center' },
      { axis: 'y', at: el.y + el.h, kind: 'edge' },
    );
  }
  return lines;
}

export interface Snapped {
  box: Rect;
  /** Направляющие, к которым прилипли, — их рисует холст. */
  active: SnapLine[];
}

/**
 * Прилипание при перемещении: левый край, центр и правый край коробки
 * по очереди примеряются к направляющим, берётся ближайшая. То же по
 * вертикали. Сдвиг — целиком, размер не меняется.
 */
export function snapBox(box: Rect, lines: SnapLine[], threshold = SNAP_THRESHOLD_MM): Snapped {
  const active: SnapLine[] = [];
  let dx = 0;
  let dy = 0;

  for (const axis of ['x', 'y'] as const) {
    const start = axis === 'x' ? box.x : box.y;
    const size = axis === 'x' ? box.w : box.h;
    const probes = [start, start + size / 2, start + size];
    let best: { shift: number; line: SnapLine } | null = null;
    for (const line of lines) {
      if (line.axis !== axis) continue;
      for (const probe of probes) {
        const shift = line.at - probe;
        if (Math.abs(shift) > threshold) continue;
        if (!best || Math.abs(shift) < Math.abs(best.shift)) best = { shift, line };
      }
    }
    if (best) {
      if (axis === 'x') dx = best.shift;
      else dy = best.shift;
      active.push(best.line);
    }
  }

  return { box: { ...box, x: box.x + dx, y: box.y + dy }, active };
}

/** Прилипание к сетке: координаты и размеры — к ближайшему шагу. */
export function snapToGrid(box: Rect, stepMm: number): Rect {
  const r = (v: number) => Math.round(v / stepMm) * stepMm;
  return { x: r(box.x), y: r(box.y), w: Math.max(r(box.w), MIN_SIZE_MM), h: Math.max(r(box.h), MIN_SIZE_MM) };
}

/* ────────────────────────────── порядок слоёв ────────────────────────── */

/** Слои сверху вниз — как их видит человек в панели. */
export function layersTopDown(layout: SheetLayout): SheetElement[] {
  return [...layout].sort((a, b) => b.z - a.z || layout.indexOf(b) - layout.indexOf(a));
}

/** Переставить: список сверху вниз превращается в z-индексы. */
export function reorderLayers(layout: SheetLayout, topDownIds: string[]): SheetLayout {
  const z = new Map<string, number>();
  topDownIds.forEach((id, i) => z.set(id, topDownIds.length - 1 - i));
  return layout.map((el) => (z.has(el.id) ? { ...el, z: z.get(el.id)! } : el));
}

export function moveLayer(
  layout: SheetLayout,
  id: string,
  where: 'up' | 'down' | 'top' | 'bottom',
): SheetLayout {
  const order = layersTopDown(layout).map((el) => el.id);
  const index = order.indexOf(id);
  if (index < 0) return layout;
  order.splice(index, 1);
  const target =
    where === 'top' ? 0 : where === 'bottom' ? order.length : where === 'up' ? Math.max(index - 1, 0) : Math.min(index + 1, order.length);
  order.splice(target, 0, id);
  return reorderLayers(layout, order);
}

/* ───────────────────────────── общие свойства ────────────────────────── */

export const MIXED = Symbol('смешанное');
export type Mixed = typeof MIXED;

/** Значение свойства у всех выбранных — либо «смешанное». */
export function commonValue<T>(values: T[]): T | Mixed | undefined {
  if (values.length === 0) return undefined;
  const first = values[0];
  return values.every((v) => Object.is(v, first)) ? first : MIXED;
}

/** Общие свойства текстовых блоков: одно значение или «смешанное». */
export function commonTextProps(
  elements: SheetElement[],
): Partial<Record<keyof TextProps, unknown>> {
  const texts = elements.filter((el): el is SheetElement & { type: 'text' } => el.type === 'text');
  if (texts.length === 0) return {};
  const out: Partial<Record<keyof TextProps, unknown>> = {};
  const keys = Object.keys(texts[0].props) as (keyof TextProps)[];
  for (const key of keys) {
    if (key === 'doc') continue;
    out[key] = commonValue(texts.map((t) => t.props[key]));
  }
  return out;
}

/** Стиль текста, который переносится пипеткой: всё, кроме содержимого и коробки. */
export type TextStylePatch = Omit<TextProps, 'doc'>;

export function pickTextStyle(props: TextProps): TextStylePatch {
  const { doc: _doc, ...style } = props;
  return style;
}

/** Смещение копии при дублировании — чтобы копия не легла точно на оригинал. */
export const DUPLICATE_OFFSET_MM = 5;

export function nudgeBox(box: Box, dx: number, dy: number, page: { w: number; h: number }): Box {
  return {
    ...box,
    x: clamp(box.x + dx, 0, Math.max(page.w - box.w, 0)),
    y: clamp(box.y + dy, 0, Math.max(page.h - box.h, 0)),
  };
}

/** Угол поворота из положения курсора относительно центра блока. */
export function rotationFromPointer(
  center: { x: number; y: number },
  pointer: { x: number; y: number },
  snapStep: number | null,
): number {
  const raw = (Math.atan2(pointer.y - center.y, pointer.x - center.x) * 180) / Math.PI + 90;
  const normalized = ((raw + 180) % 360) - 180;
  if (!snapStep) return Math.round(normalized * 10) / 10;
  return Math.round(normalized / snapStep) * snapStep;
}
