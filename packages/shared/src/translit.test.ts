import { describe, expect, it } from 'vitest';
import { transliterateGost, transliterateIcao } from './translit';

/*
 * Каждый пример подобран так, чтобы ГОСТ и ICAO разошлись — иначе тест
 * прошёл бы и с одной таблицей на двоих, и ошибку в выборе таблицы
 * никто бы не заметил.
 */
describe('transliterateGost и transliterateIcao расходятся', () => {
  it('буква «щ»', () => {
    expect(transliterateGost('Щукина')).toBe('Shhukina');
    expect(transliterateIcao('Щукина')).toBe('Shchukina');
  });

  it('буква «х»', () => {
    expect(transliterateGost('Ходакова')).toBe('Xodakova');
    expect(transliterateIcao('Ходакова')).toBe('Khodakova');
  });

  it('буква «ц»', () => {
    expect(transliterateGost('Цветкова')).toBe('Czvetkova');
    expect(transliterateIcao('Цветкова')).toBe('Tsvetkova');
  });

  it('мягкий знак — апостроф по ГОСТ, ничего по ICAO', () => {
    expect(transliterateGost('Ольга')).toBe("Ol'ga");
    expect(transliterateIcao('Ольга')).toBe('Olga');
  });

  it('твёрдый знак — кавычка по ГОСТ, «ie» по ICAO', () => {
    // «Подъячев» — фамилия с твёрдым знаком перед «я», ровно тот случай,
    // из-за которого твёрдый знак вообще пишут.
    expect(transliterateGost('Подъячев')).toBe('Pod"yachev');
    expect(transliterateIcao('Подъячев')).toBe('Podieiachev');
  });

  it('буква «ю»', () => {
    expect(transliterateGost('Юрьева')).toBe("Yur'eva");
    expect(transliterateIcao('Юрьева')).toBe('Iureva');
  });

  it('буква «я»', () => {
    expect(transliterateGost('Яковлева')).toBe('Yakovleva');
    expect(transliterateIcao('Яковлева')).toBe('Iakovleva');
  });
});

describe('буквы, на которых таблицы совпадают', () => {
  it('двойная фамилия через дефис', () => {
    expect(transliterateGost('Иванов-Петров')).toBe('Ivanov-Petrov');
    expect(transliterateIcao('Иванов-Петров')).toBe('Ivanov-Petrov');
  });
});

describe('не наш случай — отдаём как есть', () => {
  it('пустая строка не бросает исключение', () => {
    expect(transliterateGost('')).toBe('');
    expect(transliterateIcao('')).toBe('');
  });

  it('латиница остаётся латиницей', () => {
    expect(transliterateGost('John Smith')).toBe('John Smith');
    expect(transliterateIcao('John Smith')).toBe('John Smith');
  });

  it('смешанная запись меняет только кириллическую часть', () => {
    expect(transliterateGost('ООО "Ромашка"')).toBe('OOO "Romashka"');
  });
});
