import { describe, expect, it } from 'vitest';
import { capitalizeFirst, numberInWords, numberInWordsWith, plural } from './number-in-words';

describe('число прописью', () => {
  it('пишет ноль и однозначные', () => {
    expect(numberInWords(0)).toBe('ноль');
    expect(numberInWords(1)).toBe('один');
    expect(numberInWords(9)).toBe('девять');
  });

  it('не путается на числах от одиннадцати до девятнадцати', () => {
    expect(numberInWords(11)).toBe('одиннадцать');
    expect(numberInWords(14)).toBe('четырнадцать');
    expect(numberInWords(19)).toBe('девятнадцать');
  });

  it('пишет двузначные и сотни', () => {
    expect(numberInWords(21)).toBe('двадцать один');
    expect(numberInWords(72)).toBe('семьдесят два');
    expect(numberInWords(120)).toBe('сто двадцать');
    expect(numberInWords(999)).toBe('девятьсот девяносто девять');
  });

  it('ставит тысячу в женский род, а предмет счёта — в заданный', () => {
    // «Одна тысяча», не «один»; но «двадцать одна» только если попросили.
    expect(numberInWords(1000)).toBe('одна тысяча');
    expect(numberInWords(2000)).toBe('две тысячи');
    expect(numberInWords(21)).toBe('двадцать один');
    expect(numberInWords(21, 'female')).toBe('двадцать одна');
    expect(numberInWords(22, 'female')).toBe('двадцать две');
  });

  it('справляется с миллионами и миллиардами', () => {
    expect(numberInWords(1_234_567)).toBe(
      'один миллион двести тридцать четыре тысячи пятьсот шестьдесят семь',
    );
    expect(numberInWords(2_000_000_000)).toBe('два миллиарда');
  });

  it('отвергает дробные и отрицательные', () => {
    expect(() => numberInWords(10.5)).toThrow();
    expect(() => numberInWords(-1)).toThrow();
  });
});

describe('согласование по числу', () => {
  it('различает единственное, малое и большое', () => {
    expect(plural(1, 'документ', 'документа', 'документов')).toBe('документ');
    expect(plural(3, 'документ', 'документа', 'документов')).toBe('документа');
    expect(plural(7, 'документ', 'документа', 'документов')).toBe('документов');
  });

  it('не путается на числах от одиннадцати до четырнадцати', () => {
    // Главная ловушка: по последней цифре это «документ», а правильно «документов».
    expect(plural(11, 'документ', 'документа', 'документов')).toBe('документов');
    expect(plural(14, 'документ', 'документа', 'документов')).toBe('документов');
    expect(plural(111, 'документ', 'документа', 'документов')).toBe('документов');
    expect(plural(21, 'документ', 'документа', 'документов')).toBe('документ');
  });

  it('число со словом собирается разом', () => {
    expect(numberInWordsWith(21, 'документ', 'документа', 'документов')).toBe(
      'двадцать один документ',
    );
    expect(numberInWordsWith(22, 'документ', 'документа', 'документов')).toBe(
      'двадцать два документа',
    );
    expect(numberInWordsWith(25, 'документ', 'документа', 'документов')).toBe(
      'двадцать пять документов',
    );
    expect(numberInWordsWith(120, 'час', 'часа', 'часов')).toBe('сто двадцать часов');
  });
});

describe('заглавная буква', () => {
  it('поднимает первую и не трогает пустоту', () => {
    expect(capitalizeFirst('двадцать один')).toBe('Двадцать один');
    expect(capitalizeFirst('')).toBe('');
  });
});
