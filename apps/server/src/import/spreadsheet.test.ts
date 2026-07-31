import { describe, expect, it } from 'vitest';
import iconv from 'iconv-lite';
import { buildSheet, decodeCsv, detectHeaderRow, parseCsv } from './spreadsheet';
import { suggestColumnName } from './column-names';

describe('suggestColumnName', () => {
  it('узнаёт типовые русские заголовки', () => {
    expect(suggestColumnName('ФИО')).toBe('name');
    expect(suggestColumnName('Ф.И.О. участника')).toBe('name');
    expect(suggestColumnName('Электронная почта')).toBe('email');
    expect(suggestColumnName('E-mail')).toBe('email');
    expect(suggestColumnName('Место')).toBe('place');
    expect(suggestColumnName('Клуб / команда')).toBe('team');
  });

  it('транслитерирует незнакомые заголовки', () => {
    expect(suggestColumnName('Весовая категория')).toBe('category');
    expect(suggestColumnName('Примечание')).toBe('primechanie');
  });

  it('разводит одинаковые заголовки суффиксом', () => {
    const taken = new Set<string>();
    const first = suggestColumnName('Дата', taken);
    taken.add(first);
    const second = suggestColumnName('Дата', taken);
    expect(first).toBe('date');
    expect(second).toBe('date_2');
  });

  it('никогда не начинает имя с цифры и не оставляет пустое', () => {
    expect(suggestColumnName('2024')).toMatch(/^[a-z]/);
    expect(suggestColumnName('!!!')).toBe('column');
  });
});

describe('decodeCsv', () => {
  it('читает UTF-8 с меткой порядка байтов', () => {
    const buf = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('ФИО;Почта', 'utf8')]);
    expect(decodeCsv(buf)).toBe('ФИО;Почта');
  });

  it('распознаёт Windows-1251 — так Excel сохраняет CSV', () => {
    const buf = iconv.encode('Иванов Иван;ivanov@mail.ru', 'win1251');
    expect(decodeCsv(buf)).toBe('Иванов Иван;ivanov@mail.ru');
  });
});

describe('parseCsv', () => {
  it('определяет точку с запятой как разделитель', () => {
    const rows = parseCsv(Buffer.from('ФИО;Почта\nИванов;i@mail.ru', 'utf8'));
    expect(rows[0]).toEqual(['ФИО', 'Почта']);
    expect(rows[1]).toEqual(['Иванов', 'i@mail.ru']);
  });
});

describe('detectHeaderRow', () => {
  it('находит шапку под названием мероприятия', () => {
    const grid = [
      ['Первенство России по плаванию', '', ''],
      ['12–14 марта 2026', '', ''],
      [''],
      ['ФИО', 'Почта', 'Место'],
      ['Иванов', 'i@mail.ru', '1'],
    ];
    expect(detectHeaderRow(grid)).toBe(3);
  });

  it('берёт первую строку, когда шапка сразу', () => {
    expect(detectHeaderRow([['ФИО', 'Почта'], ['Иванов', 'i@mail.ru']])).toBe(0);
  });
});

describe('buildSheet', () => {
  const grid = [
    ['Первенство России', '', ''],
    [''],
    ['ФИО', 'Электронная почта', 'Место'],
    ['Иванов Иван', 'ivanov@mail.ru', '1'],
    ['', '', ''],
    ['Пётр Ерёменко', 'petr@yandex.ru', '2'],
  ];

  it('пропускает заголовок файла и пустые строки', () => {
    const sheet = buildSheet('Лист1', grid);
    expect(sheet.headerRowIndex).toBe(2);
    expect(sheet.columns.map((c) => c.suggested)).toEqual(['name', 'email', 'place']);
    expect(sheet.rows).toEqual([
      ['Иванов Иван', 'ivanov@mail.ru', '1'],
      ['Пётр Ерёменко', 'petr@yandex.ru', '2'],
    ]);
    expect(sheet.skippedEmptyRows).toBe(1);
  });

  it('предупреждает, что шапка была не в первой строке', () => {
    expect(buildSheet('Лист1', grid).warnings.join(' ')).toMatch(/Шапка найдена в строке 3/);
  });

  it('отбрасывает колонки без заголовка вместе с их данными', () => {
    const sheet = buildSheet('Лист1', [
      ['ФИО', '', 'Почта'],
      ['Иванов', 'мусор', 'i@mail.ru'],
    ]);
    expect(sheet.columns.map((c) => c.suggested)).toEqual(['name', 'email']);
    expect(sheet.rows[0]).toEqual(['Иванов', 'i@mail.ru']);
  });

  it('сообщает, когда слишком много пустых ячеек — вероятны формулы без значений', () => {
    const sheet = buildSheet('Лист1', [
      ['ФИО', 'Почта', 'Место'],
      ['Иванов', '', ''],
      ['Петров', '', ''],
    ]);
    expect(sheet.warnings.join(' ')).toMatch(/формулы/);
  });

  it('падает с понятным сообщением, если шапки нет', () => {
    expect(() => buildSheet('Лист1', [[], ['']])).toThrow(/шапку/);
  });
});
