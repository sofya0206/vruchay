import { describe, expect, it } from 'vitest';
import { isJunkRow } from './junk-rows';
import { toTitleCase } from './sanitize';

const header = ['Место', 'ФИО', 'Клуб'];

describe('строки, которые не участники', () => {
  it('повтор шапки на новой странице', () => {
    // В длинном протоколе шапка печатается на каждой странице.
    expect(isJunkRow(['Место', 'ФИО', 'Клуб'], header)).toBe(true);
    expect(isJunkRow(['МЕСТО', 'фио', 'Клуб'], header)).toBe(true);
  });

  it('итоги и подписи судейской коллегии', () => {
    expect(isJunkRow(['Итого участников: 6', '', ''], header)).toBe(true);
    expect(isJunkRow(['Всего', '18', ''], header)).toBe(true);
    expect(isJunkRow(['Главный судья', '', 'Иванов И.И.'], header)).toBe(true);
    expect(isJunkRow(['Главный секретарь', '', 'Петров П.П.'], header)).toBe(true);
    expect(isJunkRow(['* снят с дистанции', '', ''], header)).toBe(true);
  });

  it('живого участника не трогает', () => {
    expect(isJunkRow(['1', 'Иванов Пётр', 'Дельфин'], header)).toBe(false);
    // Фамилия Судьин начинается на «судь», но это участник, а не подпись.
    expect(isJunkRow(['2', 'Судьина Анна', 'Волна'], header)).toBe(false);
    // Одно совпадение с шапкой — не повтор шапки.
    expect(isJunkRow(['Место', 'Иванов Пётр', 'Дельфин'], header)).toBe(false);
  });
});

describe('капслок и аббревиатуры', () => {
  it('в графе организации аббревиатуры остаются собой', () => {
    expect(toTitleCase('ИМ СО РАН', true)).toBe('ИМ СО РАН');
    expect(toTitleCase('МБУ ДО СШОР №3', true)).toBe('МБУ ДО СШОР №3');
    // Длинное слово рядом с аббревиатурой всё равно приводится.
    expect(toTitleCase('ГБОУ ШКОЛА', true)).toBe('ГБОУ Школа');
  });

  it('в графе с именем приводится всё: имена из четырёх букв не редкость', () => {
    expect(toTitleCase('ИВАНОВ ИВАН')).toBe('Иванов Иван');
    expect(toTitleCase('ПЕТРОВА АННА ИЛЬИНИЧНА')).toBe('Петрова Анна Ильинична');
  });
});
