import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  addColumnSchema,
  importSchema,
  MAX_IMPORT_BODY_BYTES,
  parseQuerySchema,
  setCheckedSchema,
} from './recipients.dto';
import { MAX_ROWS } from '../import/spreadsheet';

/**
 * Пределы импорта проверяются вместе, а не поодиночке.
 *
 * Разбор файла, схема подтверждения и предел тела запроса — три разных места,
 * и разъехаться им ничего не мешает. Один раз уже разъехались: разбор отдавал
 * десять тысяч строк, схема принимала пять, и импорт падал ровно на том файле,
 * ради которого потолок и поднимали.
 */
function rows(count: number, columns = 6): string[][] {
  return Array.from({ length: count }, (_, i) =>
    [
      `Иванов Иван Петрович ${i + 1}`,
      `ivanov${i + 1}@mail.ru`,
      String((i % 3) + 1),
      `Клуб «Сокол» ${i % 50}`,
      `Тренер Петров ${i % 20}`,
      '24.08.2026',
    ].slice(0, columns),
  );
}

const columns = ['name', 'email', 'place', 'team', 'coach', 'date'];

describe('importSchema', () => {
  it('принимает столько строк, сколько отдаёт разбор файла', () => {
    const parsed = importSchema.safeParse({ columns, rows: rows(MAX_ROWS), mode: 'append' });
    expect(parsed.success).toBe(true);
  });

  it('строку сверх потолка не принимает', () => {
    const parsed = importSchema.safeParse({ columns, rows: rows(MAX_ROWS + 1), mode: 'append' });
    expect(parsed.success).toBe(false);
  });

  it('по умолчанию дописывает, а не заменяет таблицу', () => {
    const parsed = importSchema.parse({ columns: ['name'], rows: [['Иванов']] });
    expect(parsed.mode).toBe('append');
  });

  it('имя колонки только латиницей — оно же имя переменной в макете', () => {
    expect(importSchema.safeParse({ columns: ['ФИО'], rows: [['Иванов']] }).success).toBe(false);
  });

  it('заголовков должно быть столько же, сколько колонок', () => {
    /*
     * Разъехавшиеся массивы подписали бы колонки чужими заголовками:
     * «Команда» над годом рождения хуже, чем служебное `birth_year`, —
     * первое человек примет за правду.
     */
    const ok = importSchema.safeParse({
      columns: ['name', 'team'],
      titles: ['ФИО', 'Команда'],
      rows: [['Иванов', 'Луч']],
    });
    expect(ok.success).toBe(true);

    const short = importSchema.safeParse({
      columns: ['name', 'team'],
      titles: ['ФИО'],
      rows: [['Иванов', 'Луч']],
    });
    expect(short.success).toBe(false);
  });

  it('без заголовков импорт принимается: вставка из буфера шапки не шлёт', () => {
    expect(importSchema.safeParse({ columns: ['name'], rows: [['Иванов']] }).success).toBe(true);
  });
});

describe('MAX_IMPORT_BODY_BYTES', () => {
  it('вмещает подтверждение импорта на полный файл', () => {
    // Русские буквы в UTF-8 занимают по два байта — на них предел и проверяем.
    const body = JSON.stringify({ columns, rows: rows(MAX_ROWS), mode: 'append' });
    expect(Buffer.byteLength(body)).toBeLessThan(MAX_IMPORT_BODY_BYTES);
  });

  it('вмещает и самый широкий список, какой пропускает схема', () => {
    const wide = Array.from({ length: 30 }, (_, i) => `column_${i + 1}`);
    const body = JSON.stringify({
      columns: wide,
      rows: Array.from({ length: MAX_ROWS }, (_, i) =>
        wide.map((_, c) => `Значение ${c + 1} строки ${i + 1}`),
      ),
      mode: 'append',
    });
    expect(Buffer.byteLength(body)).toBeLessThan(MAX_IMPORT_BODY_BYTES);
  });
});

describe('setCheckedSchema', () => {
  const ids = (count: number) => Array.from({ length: count }, () => randomUUID());

  it('отмечает пачкой столько же строк, сколько влезает в документ', () => {
    // Иначе на полном списке «отметить все» упрётся в предел, которого
    // в самом документе уже нет.
    expect(setCheckedSchema.safeParse({ checked: true, rowIds: ids(MAX_ROWS) }).success).toBe(true);
  });

  it('строку сверх потолка не принимает', () => {
    expect(setCheckedSchema.safeParse({ checked: true, rowIds: ids(MAX_ROWS + 1) }).success).toBe(
      false,
    );
  });

  it('без списка строк действует на весь документ', () => {
    expect(setCheckedSchema.parse({ checked: false }).rowIds).toBeUndefined();
  });
});

describe('parseQuerySchema', () => {
  it('по умолчанию первую строку разбирает сам', () => {
    expect(parseQuerySchema.parse({}).headers).toBe('auto');
  });

  it('принимает только известные значения', () => {
    expect(parseQuerySchema.parse({ headers: 'none' }).headers).toBe('none');
    expect(parseQuerySchema.parse({ headers: 'headers' }).headers).toBe('headers');
    expect(parseQuerySchema.safeParse({ headers: 'первая' }).success).toBe(false);
  });
});

describe('addColumnSchema', () => {
  it('принимает название по-русски без имени переменной', () => {
    expect(addColumnSchema.safeParse({ title: 'Год рождения' }).success).toBe(true);
  });

  it('имя переменной по-прежнему только латиницей', () => {
    expect(addColumnSchema.safeParse({ name: 'Команда' }).success).toBe(false);
  });

  it('без имени и без названия не принимает', () => {
    expect(addColumnSchema.safeParse({}).success).toBe(false);
    expect(addColumnSchema.safeParse({ title: '   ' }).success).toBe(false);
  });
});
