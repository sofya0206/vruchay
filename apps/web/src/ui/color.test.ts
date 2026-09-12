import { describe, expect, it } from 'vitest';
import { hexToHsv, hsvToHex, normalizeHex } from './color';

/*
 * Переход туда-обратно обязан возвращать тот же код. Иначе цвет «уползал»
 * бы на единицу при каждом открытии палитры: человек открыл, ничего не
 * тронул, закрыл — а в макете уже другое значение, и лист считается
 * изменённым.
 */
describe('цвет: оттенок-насыщенность-яркость', () => {
  it('круг сходится на цветах палитры', () => {
    for (const hex of ['#127ee3', '#0f77ff', '#d92d3f', '#091135', '#e1e9f0', '#ffffff']) {
      expect(hsvToHex(hexToHsv(hex))).toBe(hex);
    }
  });

  it('у серого оттенок нулевой, а не случайный', () => {
    expect(hexToHsv('#808080').h).toBe(0);
    expect(hexToHsv('#808080').s).toBe(0);
    expect(hexToHsv('#000000')).toEqual({ h: 0, s: 0, v: 0 });
  });

  it('чистые цвета дают ожидаемый оттенок', () => {
    expect(hexToHsv('#ff0000').h).toBe(0);
    expect(hexToHsv('#00ff00').h).toBe(120);
    expect(hexToHsv('#0000ff').h).toBe(240);
  });

  it('оттенок за пределами круга не ломает перевод', () => {
    expect(hsvToHex({ h: 360, s: 1, v: 1 })).toBe('#ff0000');
    expect(hsvToHex({ h: -60, s: 1, v: 1 })).toBe('#ff00ff');
  });
});

describe('разбор кода цвета', () => {
  it('понимает полную запись', () => {
    expect(normalizeHex('#1F5D3F')).toBe('#1f5d3f');
    expect(normalizeHex('1F5D3F')).toBe('#1f5d3f');
  });

  it('разворачивает трёхзначную', () => {
    expect(normalizeHex('#fc0')).toBe('#ffcc00');
  });

  it('недописанное цветом не считает', () => {
    expect(normalizeHex('#1F')).toBeNull();
    expect(normalizeHex('')).toBeNull();
    expect(normalizeHex('#gggggg')).toBeNull();
  });
});
