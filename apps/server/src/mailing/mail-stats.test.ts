import { describe, expect, it } from 'vitest';
import {
  addToFunnel,
  emptyFunnel,
  fillDays,
  moscowDay,
  resolvePeriod,
  type Period,
} from './mail-stats';

/*
 * Сводка по письмам ошибается не в запросе, а в границах: письмо,
 * ушедшее в 01:30 по Москве, по UTC ещё вчерашнее, и сводка «за сегодня»
 * его теряла бы. Здесь проверяется ровно это — дни, отрезки и воронка.
 */

describe('день по Москве', () => {
  it('ночное письмо — уже сегодняшнее, хотя по UTC ещё вчера', () => {
    expect(moscowDay(new Date('2026-09-14T22:30:00Z'))).toBe('2026-09-15');
    expect(moscowDay(new Date('2026-09-14T20:59:59Z'))).toBe('2026-09-14');
  });
});

describe('отрезок сводки', () => {
  const now = new Date('2026-09-18T10:00:00Z');

  it('без дат — последние тридцать дней, считая сегодняшний', () => {
    const period = resolvePeriod({}, now) as Period;
    expect(period.from).toBe('2026-08-20');
    expect(period.to).toBe('2026-09-18');
  });

  it('границы — московские полночи', () => {
    const period = resolvePeriod({ from: '2026-09-15', to: '2026-09-15' }, now) as Period;
    expect(period.start.toISOString()).toBe('2026-09-14T21:00:00.000Z');
    expect(period.end.toISOString()).toBe('2026-09-15T21:00:00.000Z');
  });

  it('перевёрнутый и слишком длинный отрезок — ошибка, а не молчаливая подрезка', () => {
    expect(resolvePeriod({ from: '2026-09-18', to: '2026-09-01' }, now)).toHaveProperty('error');
    expect(resolvePeriod({ from: '2024-01-01', to: '2026-09-18' }, now)).toHaveProperty('error');
    expect(resolvePeriod({ from: '2025-09-18', to: '2026-09-18' }, now)).not.toHaveProperty(
      'error',
    );
  });
});

describe('воронка', () => {
  it('нарастающим итогом: прочитанное и доставлено, и отправлено', () => {
    const funnel = addToFunnel(emptyFunnel(), 'opened', 2);
    expect(funnel).toMatchObject({ total: 2, sent: 2, delivered: 2, opened: 2, failed: 0 });
  });

  it('отказ ящика ушёл от нас, отказ шлюза — нет; оба не дошли', () => {
    const funnel = addToFunnel(addToFunnel(emptyFunnel(), 'bounced', 1), 'failed', 1);
    expect(funnel).toMatchObject({ total: 2, sent: 1, delivered: 0, failed: 2 });
  });

  it('письмо в очереди не отправлено и не провалено', () => {
    expect(addToFunnel(emptyFunnel(), 'queued', 3)).toMatchObject({
      total: 3,
      queued: 3,
      sent: 0,
      failed: 0,
    });
  });
});

describe('ряд по дням', () => {
  it('пустые дни стоят нулями, а не пропадают', () => {
    const rows = fillDays([{ day: '2026-09-16', ...emptyFunnel(), total: 5 }], {
      from: '2026-09-15',
      to: '2026-09-17',
    });
    expect(rows.map((r) => [r.day, r.total])).toEqual([
      ['2026-09-15', 0],
      ['2026-09-16', 5],
      ['2026-09-17', 0],
    ]);
  });

  it('переход через конец месяца', () => {
    const rows = fillDays([], { from: '2026-02-27', to: '2026-03-02' });
    expect(rows.map((r) => r.day)).toEqual([
      '2026-02-27',
      '2026-02-28',
      '2026-03-01',
      '2026-03-02',
    ]);
  });
});
