import { describe, expect, it } from 'vitest';
import iconv from 'iconv-lite';
import ExcelJS from 'exceljs';
import { buildSheet, decodeCsv, detectHeaderRow, parseCsv, parseSpreadsheet } from './spreadsheet';
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
    expect(
      detectHeaderRow([
        ['ФИО', 'Почта'],
        ['Иванов', 'i@mail.ru'],
      ]),
    ).toBe(0);
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

describe('parseSpreadsheet, книга Excel', () => {
  async function xlsx(build: (wb: ExcelJS.Workbook) => void): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    build(wb);
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  it('берёт лист со списком, а не обложку книги', async () => {
    const sheet = await parseSpreadsheet(
      await xlsx((wb) => {
        wb.addWorksheet('Инструкция').addRow(['Заполните лист «Участники»']);
        const ws = wb.addWorksheet('Участники');
        ws.addRow(['ФИО', 'Почта']);
        ws.addRow(['Иванов Иван', 'ivanov@mail.ru']);
      }),
      'protokol.xlsx',
    );
    expect(sheet.sheetName).toBe('Участники');
    expect(sheet.rows).toEqual([['Иванов Иван', 'ivanov@mail.ru']]);
  });

  it('предупреждает, что остальные листы книги не загружены', async () => {
    const sheet = await parseSpreadsheet(
      await xlsx((wb) => {
        for (const name of ['50 м вольный', '100 м брасс']) {
          const ws = wb.addWorksheet(name);
          ws.addRow(['ФИО', 'Почта']);
          ws.addRow(['Иванов', 'i@mail.ru']);
        }
      }),
      'protokol.xlsx',
    );
    expect(sheet.sheetName).toBe('50 м вольный');
    expect(sheet.warnings.join(' ')).toContain('«100 м брасс»');
  });

  it('ошибку формулы читает как пустую ячейку, а не «[object Object]»', async () => {
    const sheet = await parseSpreadsheet(
      await xlsx((wb) => {
        const ws = wb.addWorksheet('Лист1');
        ws.addRow(['ФИО', 'Почта', 'Очки']);
        const row = ws.addRow(['Иванов', 'i@mail.ru', null]);
        row.getCell(3).value = {
          formula: 'VLOOKUP(A2,X:Y,2,0)',
          result: { error: '#N/A' },
        } as never;
      }),
      'protokol.xlsx',
    );
    expect(sheet.rows[0]).toEqual(['Иванов', 'i@mail.ru', '']);
    expect(sheet.warnings.join(' ')).toContain('ошибками формул');
  });

  it('дату из формулы отдаёт в привычном виде', async () => {
    const sheet = await parseSpreadsheet(
      await xlsx((wb) => {
        const ws = wb.addWorksheet('Лист1');
        ws.addRow(['ФИО', 'Почта', 'Дата выдачи']);
        const row = ws.addRow(['Иванов', 'i@mail.ru', null]);
        row.getCell(3).value = { formula: 'TODAY()', result: new Date(2026, 7, 24) } as never;
      }),
      'protokol.xlsx',
    );
    expect(sheet.rows[0][2]).toBe('24.08.2026');
  });

  it('склеивает двухэтажную шапку и не теряет первого участника', async () => {
    const sheet = await parseSpreadsheet(
      await xlsx((wb) => {
        const ws = wb.addWorksheet('Лист1');
        ws.addRow(['ФИО', 'Контакты', '']);
        ws.addRow(['', 'почта', 'телефон']);
        ws.mergeCells('A1:A2');
        ws.mergeCells('B1:C1');
        ws.addRow(['Иванов', 'i@mail.ru', '+7 900 000-00-00']);
      }),
      'protokol.xlsx',
    );
    expect(sheet.columns.map((c) => c.source)).toEqual([
      'ФИО',
      'Контакты почта',
      'Контакты телефон',
    ]);
    expect(sheet.rows).toEqual([['Иванов', 'i@mail.ru', '+7 900 000-00-00']]);
  });

  it('не принимает первого участника за второй этаж шапки', async () => {
    const sheet = await parseSpreadsheet(
      await xlsx((wb) => {
        const ws = wb.addWorksheet('Лист1');
        ws.addRow(['ФИО', 'Результат', '']);
        ws.mergeCells('B1:C1');
        ws.addRow(['Иванов Иван', 'отлично', 'хорошо']);
      }),
      'protokol.xlsx',
    );
    expect(sheet.rows).toEqual([['Иванов Иван', 'отлично', 'хорошо']]);
  });

  it('не считает хвост пустых строк пропущенными строками', async () => {
    const sheet = await parseSpreadsheet(
      await xlsx((wb) => {
        const ws = wb.addWorksheet('Лист1');
        ws.addRow(['ФИО', 'Почта']);
        ws.addRow(['Иванов', 'i@mail.ru']);
        ws.getCell('A300').value = null;
      }),
      'protokol.xlsx',
    );
    expect(sheet.rows).toHaveLength(1);
    expect(sheet.warnings.join(' ')).not.toContain('Пропущено пустых строк');
  });

  it('переносы строк в заголовке не попадают в название колонки', async () => {
    const sheet = await parseSpreadsheet(
      await xlsx((wb) => {
        const ws = wb.addWorksheet('Лист1');
        ws.addRow([' ФИО\nучастника ', 'E-mail ']);
        ws.addRow(['Иванов', 'i@mail.ru']);
      }),
      'protokol.xlsx',
    );
    expect(sheet.columns.map((c) => c.source)).toEqual(['ФИО участника', 'E-mail']);
  });
});
