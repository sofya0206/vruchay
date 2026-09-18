import { describe, expect, it } from 'vitest';
import type { StatsSource } from './api';
import { groupByEvent, rangePeriod, share } from './mail-stats';
import { parseEmailCount } from './text-mailing';

const funnel = { total: 0, sent: 0, delivered: 0, opened: 0, failed: 0, queued: 0 };

function source(patch: Partial<StatsSource>): StatsSource {
  return { id: 'x', type: 'document', title: '', eventName: '', ...funnel, ...patch };
}

describe('доля в сводке писем', () => {
  it('считается от прошедших очередь: письмо в очереди не занижает прочтение', () => {
    expect(share(5, { ...funnel, total: 20, queued: 10 })).toBe('50%');
  });

  it('одно из тысячи — не ноль, а «меньше процента»', () => {
    expect(share(1, { ...funnel, total: 1000 })).toBe('<1%');
  });

  it('когда ушедших нет — прочерк, а не 0%', () => {
    expect(share(0, { ...funnel, total: 3, queued: 3 })).toBe('—');
  });
});

describe('разбивка по мероприятиям', () => {
  it('складывает материалы одного мероприятия, рассылки оставляет отдельно', () => {
    const rows = groupByEvent([
      source({ id: 'a', eventName: 'Кубок', total: 3, opened: 1 }),
      source({ id: 'b', eventName: ' Кубок ', total: 2, opened: 2 }),
      source({ id: 'c', total: 1 }),
      source({ id: 'm', type: 'mailing', title: 'Перенос', total: 4 }),
    ]);
    expect(rows.map((r) => [r.title, r.total, r.opened])).toEqual([
      ['Кубок', 5, 3],
      ['Перенос', 4, 0],
      ['Мероприятие не указано', 1, 0],
    ]);
  });
});

describe('отрезок по кнопке', () => {
  it('семь дней, считая сегодняшний по Москве', () => {
    expect(rangePeriod('7', new Date('2026-09-18T22:30:00Z'))).toEqual({
      from: '2026-09-13',
      to: '2026-09-19',
    });
  });
});

describe('число адресов у поля «Кому»', () => {
  it('разбирает как сервер: любые разделители, без повторов и регистра', () => {
    expect(parseEmailCount('a@x.ru, A@x.ru; b@x.ru\n\n c@x.ru')).toBe(3);
    expect(parseEmailCount('  ')).toBe(0);
  });
});
