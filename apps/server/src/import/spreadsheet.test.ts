import { describe, expect, it } from 'vitest';
import iconv from 'iconv-lite';
import ExcelJS from 'exceljs';
import {
  buildSheet,
  decodeCsv,
  detectHeaderRow,
  MAX_ROWS,
  parseCsv,
  parseSpreadsheet,
} from './spreadsheet';
import { suggestColumnName } from './column-names';
import {
  cleanCell,
  fixHomoglyphs,
  hasMixedAlphabets,
  isShouting,
  sanitizeRows,
  toTitleCase,
} from './sanitize';

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

describe('первая строка: заголовки или данные', () => {
  const withoutHeader = [
    ['Иванов Иван', 'ivanov@mail.ru', '1'],
    ['Петров Пётр', 'petrov@mail.ru', '2'],
  ];

  it('по требованию читает первую строку как данные и называет колонки по порядку', () => {
    const sheet = buildSheet('Лист1', withoutHeader, 'none');
    expect(sheet.headerMode).toBe('none');
    expect(sheet.columns.map((c) => c.source)).toEqual(['Колонка 1', 'Колонка 2', 'Колонка 3']);
    expect(sheet.columns.map((c) => c.suggested)).toEqual(['column_1', 'column_2', 'column_3']);
    expect(sheet.rows).toEqual(withoutHeader);
    expect(sheet.warnings.join(' ')).toContain('Первая строка взята как данные');
  });

  it('предупреждает, когда первая строка похожа на данные', () => {
    const sheet = buildSheet('Лист1', withoutHeader);
    // Разбор не решает за пользователя: строки под шапкой есть, значит
    // файл выглядит обычным. Но первый участник уехал бы в заголовки молча.
    expect(sheet.headerMode).toBe('headers');
    expect(sheet.firstRowLooksLikeData).toBe(true);
    expect(sheet.warnings.join(' ')).toContain('Первая строка похожа на данные');
  });

  it('на обычной шапке не выдумывает предупреждения', () => {
    const sheet = buildSheet('Лист1', [
      ['ФИО', 'Электронная почта', 'Место'],
      ['Иванов Иван', 'ivanov@mail.ru', '1'],
    ]);
    expect(sheet.firstRowLooksLikeData).toBe(false);
    expect(sheet.warnings.join(' ')).not.toContain('похожа на данные');
  });

  it('одну строку без шапки разбирает как данные, а не как пустой список', () => {
    // Так выглядит вставка одного участника: шапки нет, и разбирать
    // единственную строку как заголовки — значит не импортировать ничего.
    const sheet = buildSheet('', [['Иванов Иван', 'ivanov@mail.ru']]);
    expect(sheet.headerMode).toBe('none');
    expect(sheet.rows).toEqual([['Иванов Иван', 'ivanov@mail.ru']]);
  });

  it('выбор человека не пересматривает', () => {
    // Явное «в первой строке заголовки» сильнее любой эвристики.
    const sheet = buildSheet('', [['Иванов Иван', 'ivanov@mail.ru']], 'headers');
    expect(sheet.headerMode).toBe('headers');
    expect(sheet.rows).toEqual([]);
  });

  it('пустые колонки справа в имена не превращает', () => {
    const sheet = buildSheet('Лист1', [['Иванов', 'i@mail.ru', '', '']], 'none');
    expect(sheet.columns).toHaveLength(2);
  });
});

describe('вставка из буфера обмена', () => {
  // Кабинет отправляет вставленный текст тем же маршрутом, что и файл,
  // под именем clipboard.tsv — разбор обязан узнать в нём таблицу.
  it('разбирает TSV из Excel как обычный файл', async () => {
    const pasted =
      'ФИО\tЭлектронная почта\tМесто\nИванов Иван\ti@mail.ru\t1\nПетров Пётр\tp@mail.ru\t2';
    const sheet = await parseSpreadsheet(Buffer.from(pasted, 'utf8'), 'clipboard.tsv');
    expect(sheet.columns.map((c) => c.suggested)).toEqual(['name', 'email', 'place']);
    expect(sheet.rows).toEqual([
      ['Иванов Иван', 'i@mail.ru', '1'],
      ['Петров Пётр', 'p@mail.ru', '2'],
    ]);
  });

  it('диапазон без шапки разбирает по требованию клиента', async () => {
    const pasted = 'Иванов Иван\ti@mail.ru\nПетров Пётр\tp@mail.ru';
    const sheet = await parseSpreadsheet(Buffer.from(pasted, 'utf8'), 'clipboard.tsv', 'none');
    expect(sheet.headerMode).toBe('none');
    expect(sheet.rows).toEqual([
      ['Иванов Иван', 'i@mail.ru'],
      ['Петров Пётр', 'p@mail.ru'],
    ]);
  });

  it('находит шапку, даже если сверху захвачены лишние строки', async () => {
    const pasted = 'Протокол\t\t\nФИО\tПочта\t\nИванов\ti@mail.ru\t';
    const sheet = await parseSpreadsheet(Buffer.from(pasted, 'utf8'), 'clipboard.tsv');
    expect(sheet.headerRowIndex).toBe(1);
    expect(sheet.rows).toEqual([['Иванов', 'i@mail.ru']]);
  });
});

describe('чистка значений', () => {
  it('схлопывает пробелы, убирает неразрывный пробел и невидимые символы', () => {
    expect(cleanCell('  Иванов   Иван  ')).toBe('Иванов Иван');
    expect(cleanCell('Иванов\u00a0\u00a0Иван')).toBe('Иванов Иван');
    expect(cleanCell('Иванов\u200bИван')).toBe('ИвановИван');
    expect(cleanCell('Иванов\nИван')).toBe('Иванов Иван');
  });

  it('капслоком считает только крик, но не аббревиатуры', () => {
    expect(isShouting('ИВАНОВ ИВАН')).toBe(true);
    expect(isShouting('МОСКВА')).toBe(true);
    expect(isShouting('КМС')).toBe(false);
    expect(isShouting('Иванов Иван')).toBe(false);
    expect(isShouting('1')).toBe(false);
  });

  it('приводит капслок к обычному виду, сохраняя дефис и апостроф', () => {
    expect(toTitleCase('ИВАНОВ ИВАН ПЕТРОВИЧ')).toBe('Иванов Иван Петрович');
    expect(toTitleCase('ПЕТРОВА-ВОДКИНА АННА')).toBe('Петрова-Водкина Анна');
    expect(toTitleCase("О'КОННОР")).toBe("О'Коннор");
  });

  it('находит кириллицу внутри латинского адреса и заменяет двойники', () => {
    // Здесь «о» и «а» — русские буквы: с виду адрес правильный.
    expect(hasMixedAlphabets('ivanоv@mail.ru')).toBe(true);
    expect(hasMixedAlphabets('ivanov@mail.ru')).toBe(false);
    expect(fixHomoglyphs('ivanоv@mаil.ru')).toBe('ivanov@mail.ru');
  });

  it('не угадывает за пользователя, когда кириллица не двойник', () => {
    expect(fixHomoglyphs('иванов@mail.ru')).toBeNull();
  });

  it('почту приводит к строчным, а имя не трогает', () => {
    const result = sanitizeRows([['Иванов  Иван', 'Ivanov@Mail.RU']], ['ФИО', 'Почта']);
    expect(result.rows).toEqual([['Иванов Иван', 'ivanov@mail.ru']]);
    expect(result.warnings.join(' ')).toContain('Адреса почты приведены к строчным');
    expect(result.warnings.join(' ')).toContain('убраны в ячейках: 1');
  });

  it('капслок и адрес с кириллицей только предлагает исправить', () => {
    const result = sanitizeRows(
      [
        ['ИВАНОВ ИВАН', 'ivanоv@mail.ru'],
        ['ПЕТРОВ ПЁТР', 'petrov@mail.ru'],
      ],
      ['ФИО', 'Почта'],
    );
    // Сами строки не изменились — решение за пользователем.
    expect(result.rows[0]).toEqual(['ИВАНОВ ИВАН', 'ivanоv@mail.ru']);

    const uppercase = result.suggestions.find((s) => s.kind === 'uppercase');
    expect(uppercase).toMatchObject({ column: 0, columnTitle: 'ФИО', count: 2 });
    expect(uppercase?.values).toEqual(['Иванов Иван', 'Петров Пётр']);

    const email = result.suggestions.find((s) => s.kind === 'email-homoglyph');
    expect(email).toMatchObject({ column: 1, count: 1, after: 'ivanov@mail.ru' });
    expect(email?.values).toEqual(['ivanov@mail.ru', 'petrov@mail.ru']);
  });

  it('не раздувает ответ: предложений не больше десяти', () => {
    const titles = Array.from({ length: 20 }, (_, i) => `Колонка ${i + 1}`);
    const result = sanitizeRows([titles.map(() => 'ИВАНОВ ИВАН')], titles);
    expect(result.suggestions).toHaveLength(10);
    expect(result.warnings.join(' ')).toContain('Предложений по чистке больше 10');
  });

  it('о неисправимой кириллице в адресе предупреждает, а не молчит', () => {
    const result = sanitizeRows([['Иванов', 'иванов@mail.ru']], ['ФИО', 'Почта']);
    expect(result.suggestions).toHaveLength(0);
    expect(result.warnings.join(' ')).toContain('адресов с кириллицей: 1');
  });
});

describe('чистка при разборе листа', () => {
  it('двойные пробелы уходят, а предложение по капслоку доезжает до диалога', () => {
    const sheet = buildSheet('Лист1', [
      ['ФИО', 'Почта'],
      ['ИВАНОВ  ИВАН', ' Ivanov@Mail.ru '],
    ]);
    expect(sheet.rows).toEqual([['ИВАНОВ ИВАН', 'ivanov@mail.ru']]);
    expect(sheet.suggestions.map((s) => s.kind)).toEqual(['uppercase']);
    expect(sheet.suggestions[0].values).toEqual(['Иванов Иван']);
  });
});

describe('потолок строк', () => {
  /** Лист на N строк: шапка и данные, как в обычном протоколе. */
  function grid(dataRows: number): string[][] {
    const rows: string[][] = [['ФИО', 'Электронная почта', 'Место']];
    for (let i = 1; i <= dataRows; i++) {
      rows.push([`Иванов Иван ${i}`, `ivanov${i}@mail.ru`, String((i % 3) + 1)]);
    }
    return rows;
  }

  it('берёт все десять тысяч строк и не жалуется на потолок', () => {
    expect(MAX_ROWS).toBeGreaterThanOrEqual(10000);
    const sheet = buildSheet('Лист1', grid(MAX_ROWS));
    expect(sheet.rows).toHaveLength(MAX_ROWS);
    expect(sheet.warnings.join(' ')).not.toContain('не поместились');
  });

  it('лишние строки отбрасывает и говорит об этом', () => {
    const sheet = buildSheet('Лист1', grid(MAX_ROWS + 10));
    expect(sheet.rows).toHaveLength(MAX_ROWS);
    expect(sheet.warnings.join(' ')).toContain(`Взяты первые ${MAX_ROWS} строк`);
  });

  it('книга Excel на десять тысяч строк разбирается за секунды, а не за минуты', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Участники');
    for (const row of grid(MAX_ROWS)) ws.addRow(row);
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());

    const started = Date.now();
    const sheet = await parseSpreadsheet(buffer, 'protokol.xlsx');
    const elapsed = Date.now() - started;

    expect(sheet.rows).toHaveLength(MAX_ROWS);
    // На машине разработчика — около полусекунды. Порог нарочно с запасом:
    // он ловит не медленную машину, а возврат квадратичного разбора.
    expect(elapsed).toBeLessThan(10_000);
  }, 30_000);
});
