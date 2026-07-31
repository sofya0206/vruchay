/**
 * Геометрия редактора. Макет хранится в миллиметрах — в тех же единицах его
 * печатает браузер при генерации PDF. Экранные пиксели живут только здесь,
 * в слое перетаскивания, и никогда не попадают в сохраняемый макет.
 */

/** CSS определяет 1 дюйм как 96 px, отсюда 1 мм = 96/25.4 px. */
export const PX_PER_MM = 96 / 25.4;

export function pxToMm(px: number, zoom: number): number {
  return px / (PX_PER_MM * zoom);
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

/** Минимальный размер блока, чтобы его нельзя было схлопнуть в точку и потерять. */
export const MIN_SIZE_MM = 5;

/** Масштаб, при котором лист целиком помещается в контейнер, с полями. */
export function fitZoom(
  containerWidthPx: number,
  containerHeightPx: number,
  pageWidthMm: number,
  pageHeightMm: number,
  paddingPx = 48,
): number {
  const availableW = Math.max(containerWidthPx - paddingPx, 100);
  const availableH = Math.max(containerHeightPx - paddingPx, 100);
  const zoom = Math.min(
    availableW / (pageWidthMm * PX_PER_MM),
    availableH / (pageHeightMm * PX_PER_MM),
  );
  return clamp(zoom, 0.1, 4);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Перемещение блока: результат удерживается в границах листа. */
export function moveBox(
  box: Box,
  deltaXMm: number,
  deltaYMm: number,
  pageWidthMm: number,
  pageHeightMm: number,
): Box {
  return {
    ...box,
    x: clamp(box.x + deltaXMm, 0, Math.max(pageWidthMm - box.w, 0)),
    y: clamp(box.y + deltaYMm, 0, Math.max(pageHeightMm - box.h, 0)),
  };
}

/**
 * Изменение размера за одну из восьми ручек. Противоположный край остаётся
 * на месте, размер не опускается ниже минимального, блок не выходит за лист.
 */
export function resizeBox(
  box: Box,
  handle: ResizeHandle,
  deltaXMm: number,
  deltaYMm: number,
  pageWidthMm: number,
  pageHeightMm: number,
): Box {
  let { x, y, w, h } = box;

  if (handle.includes('w')) {
    const right = x + w;
    x = clamp(x + deltaXMm, 0, right - MIN_SIZE_MM);
    w = right - x;
  }
  if (handle.includes('e')) {
    w = clamp(w + deltaXMm, MIN_SIZE_MM, pageWidthMm - x);
  }
  if (handle.includes('n')) {
    const bottom = y + h;
    y = clamp(y + deltaYMm, 0, bottom - MIN_SIZE_MM);
    h = bottom - y;
  }
  if (handle.includes('s')) {
    h = clamp(h + deltaYMm, MIN_SIZE_MM, pageHeightMm - y);
  }

  return { x, y, w, h };
}

/** Округление до сотых миллиметра: убирает дрожание координат от мыши. */
export function roundBox(box: Box): Box {
  const r = (v: number) => Math.round(v * 100) / 100;
  return { x: r(box.x), y: r(box.y), w: r(box.w), h: r(box.h) };
}
