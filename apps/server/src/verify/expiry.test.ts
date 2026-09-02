import { describe, expect, it } from 'vitest';
import { addIsoDuration, expiresAtFor, parseIsoDuration } from './expiry';

describe('срок действия: длительность ISO 8601', () => {
  it('разбирает год, месяцы, недели, дни и их сочетания', () => {
    expect(parseIsoDuration('P1Y')).toEqual({ years: 1, months: 0, weeks: 0, days: 0 });
    expect(parseIsoDuration('P18M')).toEqual({ years: 0, months: 18, weeks: 0, days: 0 });
    expect(parseIsoDuration('P2W')).toEqual({ years: 0, months: 0, weeks: 2, days: 0 });
    expect(parseIsoDuration('P1Y6M10D')).toEqual({ years: 1, months: 6, weeks: 0, days: 10 });
    // Регистр и пробелы вокруг — не повод отказать.
    expect(parseIsoDuration(' p1y ')).toEqual({ years: 1, months: 0, weeks: 0, days: 0 });
  });

  it('отвергает то, что длительностью не является', () => {
    for (const bad of ['', 'P', 'P0D', '1Y', 'P1H', 'PT1H', 'P1Y1Y', 'год', 'P1000Y']) {
      expect(parseIsoDuration(bad), bad).toBeNull();
    }
  });

  it('прибавляет по календарю, а не по секундам', () => {
    const issued = new Date('2026-06-17T09:00:00.000Z');
    expect(addIsoDuration(issued, parseIsoDuration('P1Y')!).toISOString()).toBe(
      '2027-06-17T09:00:00.000Z',
    );
    expect(addIsoDuration(issued, parseIsoDuration('P6M')!).toISOString()).toBe(
      '2026-12-17T09:00:00.000Z',
    );
    // 29 февраля плюс год — 1 марта.
    expect(
      addIsoDuration(new Date('2028-02-29T00:00:00.000Z'), parseIsoDuration('P1Y')!).toISOString(),
    ).toBe('2029-03-01T00:00:00.000Z');
  });
});

describe('срок действия: правило материала', () => {
  const issued = new Date('2026-06-17T09:00:00.000Z');

  it('без правила документ бессрочный', () => {
    expect(expiresAtFor(issued, { expiresIn: null, expiresAt: null })).toBeNull();
  });

  it('длительность считается от выдачи', () => {
    expect(expiresAtFor(issued, { expiresIn: 'P1Y', expiresAt: null })?.toISOString()).toBe(
      '2027-06-17T09:00:00.000Z',
    );
  });

  it('фиксированная дата побеждает длительность', () => {
    const fixed = new Date('2026-12-31T20:59:59.000Z');
    expect(expiresAtFor(issued, { expiresIn: 'P1Y', expiresAt: fixed })).toBe(fixed);
  });

  it('негодная длительность не делает документ истёкшим — он остаётся бессрочным', () => {
    expect(expiresAtFor(issued, { expiresIn: 'P0D', expiresAt: null })).toBeNull();
  });
});
