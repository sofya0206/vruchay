import { describe, expect, it } from 'vitest';
import { addStep, clamp, parseDecimal } from './number';

/*
 * Шаг считается в целых не ради красоты. Значение из панели свойств
 * уезжает в макет листа и на печать: «1.2500000000000002» переживёт
 * сохранение, перевыпуск и попадёт в PDF.
 */
describe('шаг числового поля', () => {
  it('дробный шаг не оставляет хвоста', () => {
    expect(addStep(1.2, 0.05)).toBe(1.25);
    expect(addStep(0.3, -0.1)).toBe(0.2);
    // Хрестоматийный случай: 0.1 + 0.2 в двоичной плавающей даёт 0.30000000000000004.
    expect(addStep(0.1, 0.2)).toBe(0.3);
  });

  it('работает на отрицательных — разрядка начинается с −5', () => {
    expect(addStep(-5, 0.25)).toBe(-4.75);
    expect(addStep(-0.05, -0.05)).toBe(-0.1);
  });

  it('целые остаются целыми', () => {
    expect(addStep(100, -5)).toBe(95);
    expect(addStep(0, 1)).toBe(1);
  });
});

describe('границы', () => {
  it('режет по обеим сторонам', () => {
    expect(clamp(500, 4, 200)).toBe(200);
    expect(clamp(-400, -360, 360)).toBe(-360);
    expect(clamp(1.2, 0.5, 4)).toBe(1.2);
  });

  it('без границ пропускает как есть', () => {
    expect(clamp(-9000)).toBe(-9000);
  });
});

describe('разбор набранного', () => {
  it('принимает запятую — на русской раскладке жмут её', () => {
    expect(parseDecimal('1,25')).toBe(1.25);
    expect(parseDecimal('  -3,5 ')).toBe(-3.5);
  });

  it('незаконченный набор числом не считает', () => {
    expect(parseDecimal('')).toBeNull();
    expect(parseDecimal('   ')).toBeNull();
    expect(parseDecimal('-')).toBeNull();
    expect(parseDecimal('абв')).toBeNull();
  });

  it('обычную точку и целое понимает', () => {
    expect(parseDecimal('16')).toBe(16);
    expect(parseDecimal('0.05')).toBe(0.05);
  });
});
