import { describe, expect, it } from 'vitest';
import { daysIn, fromIso, humanIso, monthGrid, shiftMonth, toIso } from './calendar';

describe('сетка месяца', () => {
  it('всегда шесть недель по семь дней', () => {
    for (const [year, month] of [
      [2026, 0],
      [2026, 1],
      [2026, 8],
      [2024, 1],
    ]) {
      const grid = monthGrid(year, month);
      expect(grid).toHaveLength(6);
      expect(grid.every((week) => week.length === 7)).toBe(true);
    }
  });

  it('начинается с понедельника', () => {
    // 1 сентября 2026 — вторник, значит слева один день августа.
    const [first] = monthGrid(2026, 8);
    expect(first[0]).toEqual({ iso: '2026-08-31', day: 31, outside: true });
    expect(first[1]).toEqual({ iso: '2026-09-01', day: 1, outside: false });
  });

  it('месяц, начинающийся с воскресенья, не теряет неделю', () => {
    // 1 февраля 2026 — воскресенье: перед ним шесть дней января.
    const [first] = monthGrid(2026, 1);
    expect(first[0].iso).toBe('2026-01-26');
    expect(first[6]).toEqual({ iso: '2026-02-01', day: 1, outside: false });
  });

  it('февраль високосного года держит 29 дней', () => {
    const days = monthGrid(2024, 1)
      .flat()
      .filter((d) => !d.outside);
    expect(days).toHaveLength(29);
    expect(days.at(-1)?.iso).toBe('2024-02-29');
  });
});

describe('переход между месяцами', () => {
  it('через границу года в обе стороны', () => {
    expect(shiftMonth(2026, 11, 1)).toEqual({ year: 2027, month: 0 });
    expect(shiftMonth(2026, 0, -1)).toEqual({ year: 2025, month: 11 });
    expect(shiftMonth(2026, 0, -13)).toEqual({ year: 2024, month: 11 });
  });
});

describe('разбор даты', () => {
  it('понимает обычную', () => {
    expect(fromIso('2026-09-12')).toEqual({ year: 2026, month: 8, day: 12 });
  });

  it('несуществующую не переносит молча на следующий месяц', () => {
    expect(fromIso('2026-02-30')).toBeNull();
    expect(fromIso('2026-02-29')).toBeNull();
    expect(fromIso('2024-02-29')).not.toBeNull();
  });

  it('пустое и мусор — не дата', () => {
    expect(fromIso('')).toBeNull();
    expect(fromIso('12.09.2026')).toBeNull();
    expect(fromIso('2026-13-01')).toBeNull();
  });
});

describe('вспомогательное', () => {
  it('длина месяца', () => {
    expect(daysIn(2026, 1)).toBe(28);
    expect(daysIn(2024, 1)).toBe(29);
    expect(daysIn(2026, 8)).toBe(30);
  });

  it('сборка строки', () => {
    expect(toIso(2026, 8, 1)).toBe('2026-09-01');
  });

  it('подпись по-русски', () => {
    expect(humanIso('2026-09-12')).toBe('12 сентября 2026');
    expect(humanIso('')).toBeNull();
  });
});
