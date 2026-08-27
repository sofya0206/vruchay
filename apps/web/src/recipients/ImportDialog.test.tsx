import { describe, expect, it } from 'vitest';
import { applySuggestions, replacedLetters, type ImportSuggestion } from './ImportDialog';

/**
 * Предложения по чистке меняют то, что уедет в базу, поэтому проверяем
 * не вид галочки, а результат: невключённое предложение не должно
 * изменить ни одной строки.
 */
const uppercase: ImportSuggestion = {
  kind: 'uppercase',
  column: 0,
  columnTitle: 'ФИО',
  count: 2,
  before: 'ИВАНОВ ИВАН',
  after: 'Иванов Иван',
  values: ['Иванов Иван', 'Петров Пётр'],
};

const email: ImportSuggestion = {
  kind: 'email-homoglyph',
  column: 1,
  columnTitle: 'Почта',
  count: 1,
  before: 'ivanоv@mail.ru',
  after: 'ivanov@mail.ru',
  values: ['ivanov@mail.ru', 'petrov@mail.ru'],
};

const rows = [
  ['ИВАНОВ ИВАН', 'ivanоv@mail.ru'],
  ['ПЕТРОВ ПЁТР', 'petrov@mail.ru'],
];

describe('applySuggestions', () => {
  it('без подтверждения ничего не меняет', () => {
    expect(applySuggestions(rows, [uppercase, email], [])).toBe(rows);
  });

  it('применяет только выбранное предложение', () => {
    expect(applySuggestions(rows, [uppercase, email], [0])).toEqual([
      ['Иванов Иван', 'ivanоv@mail.ru'],
      ['Петров Пётр', 'petrov@mail.ru'],
    ]);
  });

  it('применяет несколько предложений сразу, не портя исходные строки', () => {
    expect(applySuggestions(rows, [uppercase, email], [0, 1])).toEqual([
      ['Иванов Иван', 'ivanov@mail.ru'],
      ['Петров Пётр', 'petrov@mail.ru'],
    ]);
    expect(rows[0][0]).toBe('ИВАНОВ ИВАН');
  });
});

describe('replacedLetters', () => {
  it('называет русские буквы, которых на вид не отличить', () => {
    // Первая «о» русская, остальное латиница.
    expect(replacedLetters('ivanоv@mail.ru', 'ivanov@mail.ru')).toBe('о');
    expect(replacedLetters('ivanоv@mаil.ru', 'ivanov@mail.ru')).toBe('о, а');
  });

  it('молчит, когда сравнивать нечего', () => {
    expect(replacedLetters('a@b.ru', 'a@b.ru')).toBe('');
    expect(replacedLetters('короче', 'длиннее строки')).toBe('');
  });
});
