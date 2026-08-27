import { describe, expect, it } from 'vitest';
import { detectPastedTable } from './clipboard';

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
    // Без шапки из двух колонок разбор всё равно не найдёт заголовков,
    // а привычная вставка в ячейку сломалась бы.
    expect(detectPastedTable('Иванов\nПетров\nСидоров')).toBeNull();
  });
});
