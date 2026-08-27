import { describe, expect, it } from 'vitest';
import {
  applyMerge,
  canMergeFullName,
  columnKey,
  countBound,
  initialNames,
} from './column-mapping';

const columns = (...sources: string[]) =>
  sources.map((source) => ({ source, suggested: 'x' }));

describe('columnKey', () => {
  it('разводит одинаковые заголовки номером повторения', () => {
    const cols = columns('Дата', 'ФИО', 'Дата');
    expect(columnKey(cols, 0)).toBe('Дата');
    expect(columnKey(cols, 1)).toBe('ФИО');
    expect(columnKey(cols, 2)).toBe('Дата#1');
  });
});

describe('initialNames', () => {
  const sheet = [
    { source: 'Участник', suggested: 'name' },
    { source: 'Почта', suggested: 'email' },
  ];

  it('берёт предложенное сервисом, когда нечего вспомнить', () => {
    expect(initialNames(sheet, {})).toEqual(['name', 'email']);
  });

  it('предпочитает введённое руками', () => {
    expect(initialNames(sheet, { Участник: 'sportsman' })).toEqual(['sportsman', 'email']);
  });

  it('переживает перестановку колонок в перезалитом файле', () => {
    const reordered = [
      { source: 'Почта', suggested: 'email' },
      { source: 'Участник', suggested: 'name' },
    ];
    expect(initialNames(reordered, { Участник: 'sportsman' })).toEqual(['email', 'sportsman']);
  });

  it('не возвращает пустое имя из памяти', () => {
    // Очищенное поле не должно приезжать обратно пустым: кнопка импорта
    // осталась бы заблокированной, а причина — невидимой.
    expect(initialNames(sheet, { Участник: '' })).toEqual(['name', 'email']);
    expect(initialNames(sheet, { Участник: '   ' })).toEqual(['name', 'email']);
  });
});

describe('canMergeFullName', () => {
  it('предлагает склейку, когда есть фамилия и имя', () => {
    expect(canMergeFullName(['surname', 'firstname', 'patronymic'])).toBe(true);
    expect(canMergeFullName(['surname', 'firstname'])).toBe(true);
  });

  it('молчит, когда склеивать нечего или некуда', () => {
    expect(canMergeFullName(['surname', 'email'])).toBe(false);
    expect(canMergeFullName(['name', 'surname', 'firstname'])).toBe(false);
  });
});

describe('applyMerge', () => {
  const names = ['firstname', 'surname', 'patronymic', 'email'];
  const rows = [
    ['Иван', 'Иванов', 'Иванович', 'ivanov@mail.ru'],
    ['Пётр', 'Петров', '', 'petr@mail.ru'],
  ];

  it('собирает ФИО в порядке фамилия-имя-отчество, а не в порядке колонок', () => {
    const result = applyMerge(names, rows, true);
    expect(result.columns).toEqual(['name', 'email']);
    expect(result.rows[0]).toEqual(['Иванов Иван Иванович', 'ivanov@mail.ru']);
  });

  it('не оставляет лишних пробелов, когда отчества нет', () => {
    expect(applyMerge(names, rows, true).rows[1]).toEqual(['Петров Пётр', 'petr@mail.ru']);
  });

  it('со снятой галочкой ничего не трогает', () => {
    const result = applyMerge(names, rows, false);
    expect(result.columns).toBe(names);
    expect(result.rows).toBe(rows);
  });

  it('не склеивает, когда колонка name уже пришла из файла', () => {
    const withName = ['name', 'surname', 'firstname'];
    const result = applyMerge(withName, [['Иванов И.', 'Иванов', 'Иван']], true);
    expect(result.columns).toEqual(withName);
  });

  it('ставит склеенную колонку на место первой из частей', () => {
    const result = applyMerge(['email', 'surname', 'firstname'], [['a@b.ru', 'Иванов', 'Иван']], true);
    expect(result.columns).toEqual(['email', 'name']);
  });
});

describe('countBound', () => {
  it('считает годные имена', () => {
    expect(countBound(['name', 'email', 'place'])).toBe(3);
  });

  it('не считает пустые, повторы и недопустимые', () => {
    expect(countBound(['name', '', 'place'])).toBe(2);
    expect(countBound(['name', 'name'])).toBe(1);
    expect(countBound(['name', 'ФИО', '2place'])).toBe(1);
  });

  it('согласован со склейкой: три колонки файла дают одну переменную', () => {
    const names = ['surname', 'firstname', 'patronymic', 'email'];
    const rows = [['Иванов', 'Иван', 'Иванович', 'i@mail.ru']];
    const merged = applyMerge(names, rows, true);

    expect(countBound(names)).toBe(4);
    expect(countBound(merged.columns)).toBe(2);
    expect(merged.columns.length).toBe(2);
  });
});
