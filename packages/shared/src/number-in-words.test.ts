import { describe, expect, it } from 'vitest';
import { countWords, numberInWords, pluralForm } from './number-in-words';

describe('numberInWords', () => {
  it('простое число', () => {
    expect(numberInWords(21)).toBe('двадцать один');
  });

  it('ноль', () => {
    expect(numberInWords(0)).toBe('ноль');
  });

  it('род задаёт только последнюю группу', () => {
    expect(numberInWords(1, 'male')).toBe('один');
    expect(numberInWords(1, 'female')).toBe('одна');
    expect(numberInWords(1, 'neuter')).toBe('одно');
    expect(numberInWords(2, 'female')).toBe('две');
  });

  it('тысяча — женского рода независимо от того, что считают', () => {
    // «Двадцать одна тысяча», а не «двадцать один тысяча» — даже если
    // gender по умолчанию male, потому что «тысяча» согласуется сама
    // с собой, а не со словом, которое пойдёт после числа.
    expect(numberInWords(21_000)).toBe('двадцать одна тысяча');
    expect(numberInWords(2000)).toBe('две тысячи');
  });

  it('миллионы и миллиарды — мужского рода', () => {
    expect(numberInWords(1_000_000)).toBe('один миллион');
    expect(numberInWords(2_000_000_000)).toBe('два миллиарда');
  });

  it('составное число с несколькими разрядами', () => {
    expect(numberInWords(123_456)).toBe(
      'сто двадцать три тысячи четыреста пятьдесят шесть',
    );
  });

  it('отвергает дробные и отрицательные числа', () => {
    expect(() => numberInWords(1.5)).toThrow();
    expect(() => numberInWords(-1)).toThrow();
  });
});

describe('pluralForm', () => {
  it('различает единственное, малое и большое число', () => {
    expect(pluralForm(1, 'документ', 'документа', 'документов')).toBe('документ');
    expect(pluralForm(2, 'документ', 'документа', 'документов')).toBe('документа');
    expect(pluralForm(5, 'документ', 'документа', 'документов')).toBe('документов');
  });

  it('не путается на числах от одиннадцати до четырнадцати', () => {
    // Главная ловушка: по последней цифре это «документ», а правильно —
    // «документов».
    expect(pluralForm(11, 'документ', 'документа', 'документов')).toBe('документов');
    expect(pluralForm(14, 'документ', 'документа', 'документов')).toBe('документов');
    expect(pluralForm(21, 'документ', 'документа', 'документов')).toBe('документ');
  });
});

describe('countWords — число вместе с согласованным словом', () => {
  const DOCUMENT = { one: 'документ', few: 'документа', many: 'документов' };

  it('согласование по последним двум цифрам', () => {
    expect(countWords(21, DOCUMENT)).toBe('двадцать один документ');
    expect(countWords(22, DOCUMENT)).toBe('двадцать два документа');
    expect(countWords(25, DOCUMENT)).toBe('двадцать пять документов');
  });

  it('ловушка одиннадцати–четырнадцати', () => {
    expect(countWords(11, DOCUMENT)).toBe('одиннадцать документов');
  });

  it('род согласуется со словом, а не остаётся мужским по умолчанию', () => {
    const PLACE = { one: 'место', few: 'места', many: 'мест' };
    expect(countWords(1, PLACE, 'neuter')).toBe('одно место');
    expect(countWords(21, PLACE, 'neuter')).toBe('двадцать одно место');
  });
});
