import { describe, expect, it } from 'vitest';
import { transliterateGost, transliterateIcao } from './translit';

describe('транслитерация ФИО', () => {
  it('обычная фамилия совпадает у обоих стандартов', () => {
    expect(transliterateGost('Иванов Пётр')).toBe('Ivanov Pyotr');
    expect(transliterateIcao('Иванов Петр')).toBe('Ivanov Petr');
  });

  /*
   * Ради этих букв и заведены две таблицы вместо одной: на них
   * ГОСТ и загранпаспорт расходятся, и человек, сверяющий диплом
   * с паспортом, увидит разницу первым.
   */
  it('Щ: «shh» по ГОСТ, «shch» в паспорте', () => {
    expect(transliterateGost('Щукин')).toBe('Shhukin');
    expect(transliterateIcao('Щукин')).toBe('Shchukin');
  });

  it('Х: «x» по ГОСТ, «kh» в паспорте', () => {
    expect(transliterateGost('Хохлова')).toBe('Xoxlova');
    expect(transliterateIcao('Хохлова')).toBe('Khokhlova');
  });

  it('Ц: «cz» по ГОСТ, «ts» в паспорте', () => {
    expect(transliterateGost('Кузнецов')).toBe('Kuzneczov');
    expect(transliterateIcao('Кузнецов')).toBe('Kuznetsov');
  });

  it('Ц перед и/е/й/ь по ГОСТ пишется одной буквой', () => {
    // Единственное правило ГОСТ, зависящее от соседней буквы.
    expect(transliterateGost('Цибулин')).toBe('Cibulin');
    expect(transliterateIcao('Цибулин')).toBe('Tsibulin');
  });

  it('Ъ: по ГОСТ опускается, в паспорте становится «ie»', () => {
    expect(transliterateGost('Подъячев')).toBe('Podyachev');
    expect(transliterateIcao('Подъячев')).toBe('Podieiachev');
  });

  it('Ь опускают оба стандарта', () => {
    expect(transliterateGost('Игорь')).toBe('Igor');
    expect(transliterateIcao('Игорь')).toBe('Igor');
  });

  it('Ю: «yu» по ГОСТ, «iu» в паспорте', () => {
    expect(transliterateGost('Юрьев')).toBe('Yurev');
    expect(transliterateIcao('Юрьев')).toBe('Iurev');
  });

  it('Я: «ya» по ГОСТ, «ia» в паспорте', () => {
    expect(transliterateGost('Яковлева')).toBe('Yakovleva');
    expect(transliterateIcao('Яковлева')).toBe('Iakovleva');
  });

  it('Ё и Й тоже расходятся', () => {
    expect(transliterateGost('Соловьёв')).toBe('Solovyov');
    expect(transliterateIcao('Соловьёв')).toBe('Solovev');
    expect(transliterateGost('Андрей')).toBe('Andrej');
    expect(transliterateIcao('Андрей')).toBe('Andrei');
  });

  it('полное ФИО из трёх слов', () => {
    expect(transliterateGost('Щербакова Юлия Игоревна')).toBe('Shherbakova Yuliya Igorevna');
    expect(transliterateIcao('Щербакова Юлия Игоревна')).toBe('Shcherbakova Iuliia Igorevna');
  });

  it('капс сохраняется целиком, а не превращается в «Shh»', () => {
    // «ЩУКИН Иван» — обычная запись в протоколе: капс поставлен намеренно.
    expect(transliterateGost('ЩУКИН Иван')).toBe('SHHUKIN Ivan');
    expect(transliterateIcao('ЩУКИН Иван')).toBe('SHCHUKIN Ivan');
  });

  it('дефис, точки и цифры проходят насквозь', () => {
    expect(transliterateGost('Тер-Петросян А.')).toBe('Ter-Petrosyan A.');
    expect(transliterateIcao('Тер-Петросян А.')).toBe('Ter-Petrosian A.');
  });

  it('пустая строка и латиница отдаются без изменений', () => {
    expect(transliterateGost('')).toBe('');
    expect(transliterateIcao('')).toBe('');
    expect(transliterateGost('John Smith')).toBe('John Smith');
    expect(transliterateIcao('John Smith')).toBe('John Smith');
  });

  it('не бросает исключение ни на чём странном', () => {
    expect(() => transliterateGost('   ')).not.toThrow();
    expect(() => transliterateIcao('日本語')).not.toThrow();
    expect(transliterateIcao('日本語')).toBe('日本語');
  });
});
