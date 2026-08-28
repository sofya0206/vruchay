import { describe, expect, it } from 'vitest';
import { hasPlaceText, isNoPlace, isUnparsablePlace, parsePlace, placeMatches } from './place';

const single = (n: number) => ({ from: n, to: n, shared: false });

describe('parsePlace', () => {
  it('читает обычное число', () => {
    expect(parsePlace('1')).toEqual(single(1));
    expect(parsePlace('12')).toEqual(single(12));
  });

  it('снимает точку, пробелы и неразрывный пробел', () => {
    expect(parsePlace(' 3. ')).toEqual(single(3));
    expect(parsePlace(' 4 ')).toEqual(single(4));
  });

  it('снимает слово «место» в любом положении', () => {
    expect(parsePlace('1 место')).toEqual(single(1));
    expect(parsePlace('место 2')).toEqual(single(2));
    expect(parsePlace('3 м.')).toEqual(single(3));
  });

  it('снимает порядковое окончание через дефис и не путает его с делёжкой', () => {
    expect(parsePlace('1-е')).toEqual(single(1));
    expect(parsePlace('2-й')).toEqual(single(2));
    expect(parsePlace('1-е место')).toEqual(single(1));
  });

  it('читает римские цифры, в том числе набранные кириллицей', () => {
    expect(parsePlace('I')).toEqual(single(1));
    expect(parsePlace('III место')).toEqual(single(3));
    expect(parsePlace('IX')).toEqual(single(9));
    // «Х» здесь кириллическая — на глаз от латинской не отличить.
    expect(parsePlace('Х')).toEqual(single(10));
  });

  it('отвергает неканоническую римскую запись, а не додумывает её', () => {
    expect(parsePlace('IIII')).toBeNull();
    expect(parsePlace('ill')).toBeNull();
    expect(parsePlace('VX')).toBeNull();
  });

  it('читает делёжку мест любым из тире', () => {
    expect(parsePlace('2-3')).toEqual({ from: 2, to: 3, shared: true });
    expect(parsePlace('2–3')).toEqual({ from: 2, to: 3, shared: true });
    expect(parsePlace('4 — 6')).toEqual({ from: 4, to: 6, shared: true });
    expect(parsePlace('II-III')).toEqual({ from: 2, to: 3, shared: true });
  });

  it('восстанавливает порядок в перевёрнутом диапазоне', () => {
    expect(parsePlace('3-2')).toEqual({ from: 2, to: 3, shared: true });
  });

  it('читает делёж места знаком равенства — так пишет судейский софт', () => {
    // «=3» значит «третье место, поделено». Пока этого не было, оба призёра
    // проваливались мимо правила «место с 2 по 3» в правило «иначе».
    expect(parsePlace('=3')).toEqual({ from: 3, to: 3, shared: true });
    expect(parsePlace('=1')).toEqual({ from: 1, to: 1, shared: true });
    expect(parsePlace('= 2')).toEqual({ from: 2, to: 2, shared: true });
    expect(parsePlace('=3 место')).toEqual({ from: 3, to: 3, shared: true });
    expect(parsePlace('=II')).toEqual({ from: 2, to: 2, shared: true });
  });

  it('знак равенства без числа местом не считает', () => {
    expect(parsePlace('=')).toBeNull();
    expect(parsePlace('=б/м')).toBeNull();
  });

  it('делёж «1-2» попадает и в первое место, и во второе', () => {
    const shared = parsePlace('1-2');
    expect(shared).toEqual({ from: 1, to: 2, shared: true });
    expect(placeMatches(shared!, 1, 1)).toBe(true);
    expect(placeMatches(shared!, 2, 3)).toBe(true);
    expect(placeMatches(shared!, 3, 5)).toBe(false);
  });

  it('«б/м» и пустая графа — это отсутствие места, а не ошибка разбора', () => {
    for (const raw of ['б/м', 'Б/М', 'б/м ', 'без места', '', '   ']) {
      expect(parsePlace(raw), raw).toBeNull();
      expect(isUnparsablePlace(raw), raw).toBe(false);
    }
  });

  it('возвращает null там, где места нет', () => {
    expect(parsePlace('')).toBeNull();
    expect(parsePlace('   ')).toBeNull();
    expect(parsePlace('-')).toBeNull();
    expect(parsePlace('—')).toBeNull();
    expect(parsePlace('б/м')).toBeNull();
    expect(parsePlace('бм')).toBeNull();
    expect(parsePlace('без места')).toBeNull();
    expect(parsePlace('вне конкурса')).toBeNull();
    expect(parsePlace(null)).toBeNull();
    expect(parsePlace(undefined)).toBeNull();
  });

  it('не принимает за место то, что местом быть не может', () => {
    expect(parsePlace('0')).toBeNull();
    expect(parsePlace('1000')).toBeNull();
    expect(parsePlace('1:23.45')).toBeNull();
    expect(parsePlace('DSQ')).toBeNull();
    expect(parsePlace('1-2-3')).toBeNull();
  });
});

describe('placeMatches', () => {
  it('одиночное место попадает в свой интервал', () => {
    expect(placeMatches(single(1), 1, 3)).toBe(true);
    expect(placeMatches(single(4), 1, 3)).toBe(false);
  });

  it('делёжка засчитывается по пересечению, а не по вхождению целиком', () => {
    const shared = { from: 3, to: 4, shared: true };
    // «3-4» задевает призовую тройку — призёр не должен остаться без диплома.
    expect(placeMatches(shared, 1, 3)).toBe(true);
    expect(placeMatches(shared, 5, 10)).toBe(false);
  });

  it('интервал, заданный наоборот, работает так же', () => {
    expect(placeMatches(single(2), 3, 1)).toBe(true);
  });
});

describe('hasPlaceText', () => {
  it('отличает пустую графу от заполненной, но непонятной', () => {
    expect(hasPlaceText('  ')).toBe(false);
    expect(hasPlaceText('участвовал')).toBe(true);
  });
});

describe('isNoPlace и isUnparsablePlace', () => {
  it('«б/м» — это решение коллегии, а не наше непонимание', () => {
    expect(isNoPlace('б/м')).toBe(true);
    expect(isNoPlace('без места')).toBe(true);
    expect(isNoPlace('вне конкурса')).toBe(true);
    expect(isNoPlace('—')).toBe(true);
    expect(isNoPlace('')).toBe(true);
    expect(isUnparsablePlace('б/м')).toBe(false);
  });

  it('жалуемся только на то, что действительно не разобрали', () => {
    expect(isUnparsablePlace('см. приложение')).toBe(true);
    expect(isUnparsablePlace('участвовал')).toBe(true);
    expect(isUnparsablePlace('1')).toBe(false);
    expect(isUnparsablePlace('2-3')).toBe(false);
    expect(isUnparsablePlace('=3')).toBe(false);
    expect(isUnparsablePlace('')).toBe(false);
  });
});
