import { describe, expect, it } from 'vitest';
import { extractVariables, keepVariable, sheetLayout, substituteVariables } from './layout';

describe('sheetLayout', () => {
  it('валидирует текстовый элемент с дефолтами', () => {
    const parsed = sheetLayout.parse([
      {
        id: 'el1',
        type: 'text',
        x: 10,
        y: 20,
        w: 100,
        h: 30,
        props: { text: 'Награждается %name' },
      },
    ]);
    expect(parsed[0]).toMatchObject({
      rotation: 0,
      props: { fontFamily: 'PT Sans', align: 'center' },
    });
  });

  it('отклоняет неизвестный тип элемента', () => {
    expect(() =>
      sheetLayout.parse([{ id: 'x', type: 'video', x: 0, y: 0, w: 1, h: 1, props: {} }]),
    ).toThrow();
  });
});

describe('переменные', () => {
  it('извлекает переменные из текста и QR', () => {
    const layout = sheetLayout.parse([
      {
        id: 'a',
        type: 'text',
        x: 0,
        y: 0,
        w: 10,
        h: 10,
        props: { text: '%name — %course' },
      },
      {
        id: 'b',
        type: 'qr',
        x: 0,
        y: 0,
        w: 10,
        h: 10,
        props: { template: 'https://ex.com/%cert_id' },
      },
    ]);
    expect(extractVariables(layout).sort()).toEqual(['cert_id', 'course', 'name']);
  });

  it('подставляет значения, отсутствующие — пустая строка', () => {
    expect(substituteVariables('Привет, %name (%missing)!', { name: 'Иван' })).toBe(
      'Привет, Иван ()!',
    );
  });

  it('на холсте редактора ненайденная переменная остаётся токеном', () => {
    // Пустое место человек читает как сломавшийся блок, а «%missing»
    // прямо показывает, чего не хватает.
    expect(
      substituteVariables('Привет, %name (%missing)!', { name: 'Иван' }, keepVariable),
    ).toBe('Привет, Иван (%missing)!');
  });
});
