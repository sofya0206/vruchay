import { describe, expect, it } from 'vitest';
import { IMAGE_BOX_MM, insertedImageBox } from './image-box';

const A4 = { w: 297, h: 210 };

describe('размер новой картинки', () => {
  it('вписывается в квадрат с пропорциями файла', () => {
    const box = insertedImageBox({ width: 3000, height: 1500 }, A4);
    expect(box.w).toBe(IMAGE_BOX_MM);
    expect(box.h).toBe(IMAGE_BOX_MM / 2);
  });

  it('вертикальная — по высоте', () => {
    const box = insertedImageBox({ width: 1000, height: 2000 }, A4);
    expect(box.h).toBe(IMAGE_BOX_MM);
    expect(box.w).toBe(IMAGE_BOX_MM / 2);
  });

  it('мелкую не растягивает дальше 150 dpi', () => {
    // 150 точек — ровно дюйм при 150 dpi.
    const box = insertedImageBox({ width: 150, height: 150 }, A4);
    expect(box.w).toBeCloseTo(25.4, 1);
    expect(box.h).toBeCloseTo(25.4, 1);
  });

  it('без размеров файла — квадрат', () => {
    const box = insertedImageBox(null, A4);
    expect(box.w).toBe(box.h);
  });

  it('по умолчанию — по центру листа', () => {
    const box = insertedImageBox({ width: 3000, height: 3000 }, A4);
    expect(box.x + box.w / 2).toBeCloseTo(A4.w / 2, 1);
    expect(box.y + box.h / 2).toBeCloseTo(A4.h / 2, 1);
  });

  it('брошенная у края не вылезает за лист', () => {
    const box = insertedImageBox({ width: 3000, height: 3000 }, A4, { x: 295, y: 2 });
    expect(box.x + box.w).toBeLessThanOrEqual(A4.w);
    expect(box.y).toBeGreaterThanOrEqual(0);
  });

  it('на маленьком листе не больше его части', () => {
    const card = { w: 60, h: 50 };
    const box = insertedImageBox({ width: 3000, height: 3000 }, card);
    expect(box.w).toBeLessThanOrEqual(card.w * 0.6);
    expect(box.h).toBeLessThanOrEqual(card.h * 0.6);
  });
});
