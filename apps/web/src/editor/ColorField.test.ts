import { describe, expect, it } from 'vitest';
import { normalizeHex } from './ColorField';

/*
 * Код цвета человек копирует из брендбука или с сайта, и приходит он
 * в разном виде. Пропустить сюда мусор нельзя: `input type=color` молча
 * подставит чёрный, и текст на грамоте окажется не того цвета — заметят
 * это уже на печати.
 */

describe('разбор кода цвета', () => {
  it('принимает полную запись', () => {
    expect(normalizeHex('#1F5D3F')).toBe('#1f5d3f');
  });

  it('принимает запись без решётки', () => {
    expect(normalizeHex('1f5d3f')).toBe('#1f5d3f');
  });

  it('разворачивает трёхзначную запись', () => {
    expect(normalizeHex('#fc0')).toBe('#ffcc00');
  });

  it('не спотыкается о пробелы по краям', () => {
    // Из буфера обмена значение часто приезжает с пробелом.
    expect(normalizeHex('  #1F5D3F ')).toBe('#1f5d3f');
  });

  it('отвергает недописанное', () => {
    // Пока человек печатает, применять нечего.
    expect(normalizeHex('#1F')).toBeNull();
    expect(normalizeHex('#1F5D3')).toBeNull();
    expect(normalizeHex('#')).toBeNull();
    expect(normalizeHex('')).toBeNull();
  });

  it('отвергает не шестнадцатеричное', () => {
    expect(normalizeHex('#zzzzzz')).toBeNull();
    expect(normalizeHex('красный')).toBeNull();
  });

  it('отвергает слишком длинное', () => {
    expect(normalizeHex('#1f5d3fff')).toBeNull();
  });
});
