import { describe, expect, it } from 'vitest';
import { detectDelimiter } from './spreadsheet';
import { parseRecipientFile } from './recipient-file';

/**
 * Хвост 9.5: разбор протоколов из судейских программ.
 *
 * Проверяем ровно то, что ломалось на настоящих файлах прогона 29.08:
 * CSV не читался как протокол, разделитель определялся неверно, ФИО
 * по трём колонкам не собиралось, а старый .xls падал непонятной ошибкой.
 */
const csv = (text: string) => Buffer.from('﻿' + text, 'utf8');

describe('разделитель CSV', () => {
  it('точка с запятой не путается с запятыми внутри значений', () => {
    // Так выгружает судейская программа: разделитель «;», а в ячейках запятые.
    const text = 'Место;ФИО;Клуб\n1;"Иванов И.И., 2005 г.р.";"Дельфин, Москва"\n2;"Петров П.П., 2006 г.р.";"Волна, Тверь"';
    expect(detectDelimiter(text)).toBe(';');
  });

  it('обычную запятую по-прежнему узнаёт', () => {
    expect(detectDelimiter('name,email\nИванов,i@mail.ru\nПетров,p@mail.ru')).toBe(',');
  });

  it('табуляцию тоже', () => {
    expect(detectDelimiter('name\temail\nИванов\ti@mail.ru')).toBe('\t');
  });
});

describe('CSV читается как протокол', () => {
  it('места и группы не теряются', async () => {
    const sheet = await parseRecipientFile(
      csv('Место;ФИО;Клуб\n1;Иванов Пётр;Дельфин\n2;Петрова Анна;Волна'),
      'протокол.csv',
    );

    // Графа места — то, чего в обычном списке не бывает: файл прочитан протоколом.
    expect(sheet.protocol).toBeDefined();
    expect(sheet.columns.map((c) => c.suggested)).toContain('place');
  });
});

describe('ФИО по трём колонкам', () => {
  it('собирается в одну колонку «name»', async () => {
    const sheet = await parseRecipientFile(
      csv('Фамилия;Имя;Отчество;Почта\nИванов;Пётр;Ильич;i@mail.ru'),
      'список.csv',
    );

    const nameIndex = sheet.columns.findIndex((c) => c.suggested === 'name');
    expect(nameIndex).toBeGreaterThan(-1);
    expect(sheet.rows[0][nameIndex]).toBe('Иванов Пётр Ильич');
    expect(sheet.warnings.join(' ')).toContain('ФИО собрано');
  });

  it('одного отчества мало — колонку не выдумываем', async () => {
    const sheet = await parseRecipientFile(csv('Отчество;Почта\nИльич;i@mail.ru'), 'список.csv');
    expect(sheet.columns.some((c) => c.suggested === 'name')).toBe(false);
  });
});

describe('английская шапка', () => {
  it('колонка Name опознаётся как ФИО', async () => {
    const sheet = await parseRecipientFile(csv('Name,Email\nJohn Smith,j@mail.ru'), 'list.csv');
    expect(sheet.columns[0].suggested).toBe('name');
  });
});

describe('не-xlsx под видом книги', () => {
  it('вместо ошибки про zip объясняет, что делать', async () => {
    // HTML с расширением .xls — обычная выгрузка старых программ.
    const html = Buffer.from('<html><body><table><tr><td>Иванов</td></tr></table></body></html>');
    await expect(parseRecipientFile(html, 'протокол.xls')).rejects.toThrow(/сохраните как \.xlsx/i);
  });
});
