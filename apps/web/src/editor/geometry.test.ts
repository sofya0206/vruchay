import { describe, expect, it } from 'vitest';
import { fitZoom, moveBox, PX_PER_MM, pxToMm, resizeBox, roundBox } from './geometry';

const A4 = { w: 297, h: 210 };
const box = { x: 100, y: 80, w: 60, h: 20 };

describe('перевод единиц', () => {
  it('переводит пиксели в миллиметры с учётом масштаба', () => {
    expect(pxToMm(PX_PER_MM, 1)).toBeCloseTo(1);
    expect(pxToMm(PX_PER_MM * 2, 2)).toBeCloseTo(1);
  });
});

describe('fitZoom', () => {
  it('вписывает лист в контейнер', () => {
    const zoom = fitZoom(1000, 700, A4.w, A4.h);
    expect(A4.w * PX_PER_MM * zoom).toBeLessThanOrEqual(1000);
    expect(A4.h * PX_PER_MM * zoom).toBeLessThanOrEqual(700);
  });

  it('не уходит в ноль на крошечном контейнере', () => {
    expect(fitZoom(10, 10, A4.w, A4.h)).toBeGreaterThan(0);
  });
});

describe('moveBox', () => {
  it('перемещает блок', () => {
    expect(moveBox(box, 10, -5, A4.w, A4.h)).toMatchObject({ x: 110, y: 75 });
  });

  it('не выпускает блок за левый и верхний края', () => {
    expect(moveBox(box, -1000, -1000, A4.w, A4.h)).toMatchObject({ x: 0, y: 0 });
  });

  it('не выпускает блок за правый и нижний края', () => {
    const moved = moveBox(box, 1000, 1000, A4.w, A4.h);
    expect(moved.x + moved.w).toBeLessThanOrEqual(A4.w);
    expect(moved.y + moved.h).toBeLessThanOrEqual(A4.h);
  });
});

describe('resizeBox', () => {
  it('тянет правый край, левый остаётся на месте', () => {
    const r = resizeBox(box, 'e', 20, 0, A4.w, A4.h);
    expect(r).toMatchObject({ x: 100, w: 80 });
  });

  it('тянет левый край, правый остаётся на месте', () => {
    const r = resizeBox(box, 'w', -20, 0, A4.w, A4.h);
    expect(r.x).toBe(80);
    expect(r.x + r.w).toBe(160);
  });

  it('не даёт схлопнуть блок меньше минимума', () => {
    const r = resizeBox(box, 'e', -1000, 0, A4.w, A4.h);
    expect(r.w).toBeGreaterThanOrEqual(5);
  });

  it('не выпускает за границы листа при растягивании', () => {
    const r = resizeBox(box, 'se', 1000, 1000, A4.w, A4.h);
    expect(r.x + r.w).toBeLessThanOrEqual(A4.w);
    expect(r.y + r.h).toBeLessThanOrEqual(A4.h);
  });

  it('угловая ручка меняет обе оси', () => {
    const r = resizeBox(box, 'nw', -10, -10, A4.w, A4.h);
    expect(r).toMatchObject({ x: 90, y: 70, w: 70, h: 30 });
  });
});

describe('roundBox', () => {
  it('округляет до сотых', () => {
    expect(roundBox({ x: 1.23456, y: 2.5, w: 3.999, h: 4 })).toEqual({
      x: 1.23,
      y: 2.5,
      w: 4,
      h: 4,
    });
  });
});
