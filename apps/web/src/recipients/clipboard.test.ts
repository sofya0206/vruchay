import { describe, expect, it } from 'vitest';
import { detectPastedTable, isEditableTarget, planPaste, splitDelimited } from './clipboard';

describe('splitDelimited', () => {
  it('делит по разделителю и переносу строки', () => {
    expect(splitDelimited('ФИО\tПочта\nИванов\ti@mail.ru', '\t')).toEqual([
      ['ФИО', 'Почта'],
      ['Иванов', 'i@mail.ru'],
    ]);
  });

  it('перенос строки внутри кавычек остаётся внутри ячейки', () => {
    expect(splitDelimited('Иванов\t"Челябинск,\nул. Ленина"\nПетров\tОмск', '\t')).toEqual([
      ['Иванов', 'Челябинск,\nул. Ленина'],
      ['Петров', 'Омск'],
    ]);
  });

  it('удвоенная кавычка внутри значения — это одна кавычка', () => {
    expect(splitDelimited('Клуб\t"Клуб ""Сокол"""', '\t')).toEqual([['Клуб', 'Клуб "Сокол"']]);
  });

  it('разделитель внутри кавычек колонку не делит', () => {
    expect(splitDelimited('"Иванов, Иван";i@mail.ru', ';')).toEqual([
      ['Иванов, Иван', 'i@mail.ru'],
    ]);
  });
});

describe('detectPastedTable', () => {
  it('узнаёт диапазон, скопированный в Excel: колонки через табуляцию', () => {
    const table = detectPastedTable('ФИО\tПочта\nИванов Иван\ti@mail.ru\nПетров Пётр\tp@mail.ru');
    expect(table).toMatchObject({ rows: 3, columns: 2, delimiter: '\t' });
  });

  it('понимает перевод строки из Windows', () => {
    expect(detectPastedTable('ФИО\tПочта\r\nИванов\ti@mail.ru')).toMatchObject({ rows: 2 });
  });

  it('принимает CSV с точкой с запятой — так копируют из текстового файла', () => {
    expect(detectPastedTable('ФИО;Почта\nИванов;i@mail.ru')).toMatchObject({
      columns: 2,
      delimiter: ';',
    });
  });

  it('одной строки с табуляцией достаточно — так копируют одного участника', () => {
    expect(detectPastedTable('Иванов Иван\ti@mail.ru')).toMatchObject({
      rows: 1,
      columns: 2,
      delimiter: '\t',
    });
  });

  it('но одной строки с запятой — нет: это обычная фраза', () => {
    expect(detectPastedTable('Иванов,Пётр')).toBeNull();
    expect(detectPastedTable('Иванов;Пётр')).toBeNull();
  });

  it('ячейка с переносом строки внутри не ломает распознавание', () => {
    // Наивное деление по переносу давало здесь строки разной ширины,
    // и таблица переставала быть таблицей.
    const table = detectPastedTable('ФИО\tАдрес\nИванов\t"Челябинск,\nул. Ленина, 1"');
    expect(table).toMatchObject({ rows: 2, columns: 2, delimiter: '\t' });
  });

  it('не перехватывает обычную вставку в ячейку', () => {
    expect(detectPastedTable('Иванов Иван')).toBeNull();
    expect(detectPastedTable('Иванов Иван\n')).toBeNull();
    expect(detectPastedTable('')).toBeNull();
  });

  it('не считает таблицей текст с запятыми', () => {
    // Пробел после запятой выдаёт перечисление, а не колонки.
    expect(detectPastedTable('Иванов, Пётр и Анна\nПришли, увидели')).toBeNull();
    // Разная ширина строк — тем более не таблица.
    expect(detectPastedTable('Иванов,Пётр,Анна\nПришли,увидели')).toBeNull();
  });

  it('не считает таблицей список фамилий в одну колонку', () => {
    // Без второй колонки разбор всё равно не поймёт, что это за значения,
    // а привычная вставка в поле сломалась бы.
    expect(detectPastedTable('Иванов\nПетров\nСидоров')).toBeNull();
  });
});

describe('isEditableTarget', () => {
  it('узнаёт поля ввода', () => {
    expect(isEditableTarget({ tagName: 'INPUT' })).toBe(true);
    expect(isEditableTarget({ tagName: 'textarea' })).toBe(true);
    expect(isEditableTarget({ tagName: 'SELECT' })).toBe(true);
    expect(isEditableTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true);
  });

  it('обычные элементы страницы полями не считает', () => {
    expect(isEditableTarget({ tagName: 'DIV', isContentEditable: false })).toBe(false);
    expect(isEditableTarget({ tagName: 'BODY' })).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });
});

describe('planPaste', () => {
  const clipboard = (text: string) => ({ getData: () => text });
  const TABLE = 'ФИО\tПочта\nИванов Иван\ti@mail.ru';

  it('таблицу со страницы забирает в импорт', () => {
    const plan = planPaste({ target: { tagName: 'DIV' }, clipboardData: clipboard(TABLE) });
    expect(plan.kind).toBe('import');
    if (plan.kind !== 'import') return;
    expect(plan.table).toMatchObject({ rows: 2, columns: 2 });
    expect(plan.file.name).toBe('clipboard.tsv');
    expect(plan.file.size).toBeGreaterThan(0);
  });

  it('вставку в ячейку таблицы не трогает', () => {
    // Человек правит ячейку и вставляет туда кусок из Excel: ему нужен
    // текст в поле, а не диалог импорта поверх страницы.
    const plan = planPaste({ target: { tagName: 'INPUT' }, clipboardData: clipboard(TABLE) });
    expect(plan.kind).toBe('ignore');
  });

  it('вставку в поле с разметкой тоже не трогает', () => {
    const plan = planPaste({
      target: { tagName: 'DIV', isContentEditable: true },
      clipboardData: clipboard(TABLE),
    });
    expect(plan.kind).toBe('ignore');
  });

  it('обычный текст пропускает дальше в браузер', () => {
    expect(planPaste({ target: { tagName: 'DIV' }, clipboardData: clipboard('Иванов') })).toEqual({
      kind: 'ignore',
    });
    expect(planPaste({ target: { tagName: 'DIV' }, clipboardData: null })).toEqual({
      kind: 'ignore',
    });
  });

  it('слишком большую вставку не отправляет на сервер', () => {
    const huge = `ФИО\tПочта\n${'Иванов Иван\ti@mail.ru\n'.repeat(600_000)}`;
    expect(planPaste({ target: { tagName: 'DIV' }, clipboardData: clipboard(huge) })).toEqual({
      kind: 'too-big',
    });
  });
});
