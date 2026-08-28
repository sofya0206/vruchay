import { describe, expect, it } from 'vitest';
import {
  MAX_COORDINATE_MM,
  MAX_ELEMENTS_PER_SHEET,
  MAX_FONT_SIZE_PT,
  MAX_TEXT_LENGTH,
  extractVariables,
  keepVariable,
  sheetLayout,
  substituteVariables,
} from './layout';

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

/*
 * Пределы на размер макета.
 *
 * Макет приходит с клиента и печатает его потом браузер воркера. Пока
 * пределов не было, сдерживал только общий предел тела запроса в мегабайт —
 * а мегабайт координат и текста складывается в страницу, которую Chromium
 * верстает минутами, и достаётся такая страница каждому выпускаемому
 * документу отдельно.
 */
describe('пределы размера макета', () => {
  const text = (over: Record<string, unknown> = {}, props: Record<string, unknown> = {}) => ({
    id: 'el',
    type: 'text',
    x: 10,
    y: 10,
    w: 100,
    h: 30,
    props: { text: 'Награждается %name', ...props },
    ...over,
  });

  it('нормальный бланк проходит целиком', () => {
    const layout = Array.from({ length: 40 }, (_, i) => text({ id: `el${i}` }));
    expect(sheetLayout.parse(layout)).toHaveLength(40);
  });

  it('число элементов на листе ограничено', () => {
    const tooMany = Array.from({ length: MAX_ELEMENTS_PER_SHEET + 1 }, (_, i) =>
      text({ id: `el${i}` }),
    );
    expect(() => sheetLayout.parse(tooMany)).toThrow();
  });

  it('длина текста ограничена', () => {
    expect(() =>
      sheetLayout.parse([text({}, { text: 'а'.repeat(MAX_TEXT_LENGTH + 1) })]),
    ).toThrow();
    expect(sheetLayout.parse([text({}, { text: 'а'.repeat(MAX_TEXT_LENGTH) })])).toHaveLength(1);
  });

  it('кегль ограничен', () => {
    expect(() =>
      sheetLayout.parse([text({}, { fontSize: MAX_FONT_SIZE_PT + 1 })]),
    ).toThrow();
  });

  it('координаты и размеры ограничены', () => {
    expect(() => sheetLayout.parse([text({ x: MAX_COORDINATE_MM + 1 })])).toThrow();
    expect(() => sheetLayout.parse([text({ y: -MAX_COORDINATE_MM - 1 })])).toThrow();
    expect(() => sheetLayout.parse([text({ w: MAX_COORDINATE_MM + 1 })])).toThrow();
    expect(() => sheetLayout.parse([text({ h: MAX_COORDINATE_MM + 1 })])).toThrow();
  });

  it('шаблон QR ограничен так же, как текст', () => {
    expect(() =>
      sheetLayout.parse([
        {
          id: 'q',
          type: 'qr',
          x: 0,
          y: 0,
          w: 10,
          h: 10,
          props: { template: 'x'.repeat(MAX_TEXT_LENGTH + 1) },
        },
      ]),
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
