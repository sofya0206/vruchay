import { describe, expect, it } from 'vitest';
import { formatDate, formatDateTime } from './preferences';

describe('формат дат', () => {
  const date = new Date(2026, 8, 3, 14, 5);

  it('числами с ведущими нулями', () => {
    expect(formatDate(date, 'numeric')).toBe('03.09.2026');
  });

  it('прописью — месяц в родительном падеже', () => {
    expect(formatDate(date, 'long')).toBe('3 сентября 2026');
  });

  it('по ISO — годом вперёд, чтобы сортировалось строкой', () => {
    expect(formatDate(date, 'iso')).toBe('2026-09-03');
  });

  it('без формата — числами', () => {
    expect(formatDate(date)).toBe('03.09.2026');
  });

  it('нечитаемая дата даёт пустую строку, а не «Invalid Date»', () => {
    expect(formatDate('позавчера')).toBe('');
    expect(formatDateTime('позавчера')).toBe('');
  });

  it('со временем — дата, запятая, часы и минуты', () => {
    expect(formatDateTime(date, 'iso')).toMatch(/^2026-09-03, \d{2}:\d{2}$/);
  });
});
