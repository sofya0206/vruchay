import { describe, expect, it } from 'vitest';
import { formatCount, formatDuration, formatShare, withinTarget } from './analytics-format';

describe('доля', () => {
  it('показывается процентами', () => {
    expect(formatShare(0.8)).toBe('80%');
    expect(formatShare(0.127)).toBe('13%');
  });

  it('пустая доля — прочерк, а не ноль процентов', () => {
    // Ноль здесь означал бы «все пакеты с ошибками» у организации,
    // которая ещё ничего не выпускала.
    expect(formatShare(null)).toBe('—');
    expect(formatShare(0)).toBe('0%');
  });
});

describe('продолжительность', () => {
  it('минуты называет точно — на них и стоит ориентир', () => {
    expect(formatDuration(7)).toBe('7 минут');
    expect(formatDuration(1)).toBe('1 минута');
    expect(formatDuration(22)).toBe('22 минуты');
  });

  it('часы и дни огрубляет', () => {
    expect(formatDuration(90)).toBe('2 часа');
    expect(formatDuration(60 * 24 * 3)).toBe('3 дня');
  });

  it('мгновенный выпуск не показывается нулём минут', () => {
    expect(formatDuration(0)).toBe('меньше минуты');
    expect(formatDuration(null)).toBe('—');
  });
});

describe('ориентир', () => {
  it('десять минут ровно — это попадание', () => {
    expect(withinTarget(10, 10)).toBe(true);
    expect(withinTarget(11, 10)).toBe(false);
    expect(withinTarget(null, 10)).toBe(false);
  });
});

describe('числа', () => {
  it('крупные числа разделяются неразрывным пробелом', () => {
    // Именно неразрывным: обычный пробел переносит «480» на новую строку
    // посреди числа, и в плитке аналитики это видно.
    expect(formatCount(12480)).toBe('12\u00a0480');
  });
});
