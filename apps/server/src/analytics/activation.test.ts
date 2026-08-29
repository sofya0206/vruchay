import { describe, expect, it } from 'vitest';
import {
  FUNNEL_STEPS,
  countSteps,
  median,
  minutesBetween,
  monthRange,
  monthTitle,
  mskDay,
  share,
  stepsReached,
  type OrgFacts,
} from './activation';

/*
 * Арифметика воронки.
 *
 * Проверяем то, в чём ошибка не видна на глаз: монотонность шагов,
 * медиану вместо среднего, границы месяца по Москве и долю, которой
 * не от чего считаться.
 */

const nothing: OrgFacts = {
  hasRows: false,
  usedCheck: false,
  startedJob: false,
  hasIssued: false,
  hasMailed: false,
  issueDays: 0,
};

describe('шаги активации', () => {
  it('новая организация прошла только регистрацию', () => {
    const steps = stepsReached(nothing);
    expect(steps.registered).toBe(true);
    expect(steps.imported).toBe(false);
    expect(steps.returned).toBe(false);
  });

  it('воронка не растёт: выпустивший считается и загрузившим список', () => {
    // Так бывает у всех, кто выпустил документы и удалил список
    // получателей: строк нет, а грамоты выданы.
    const steps = stepsReached({ ...nothing, hasIssued: true });

    expect(steps.imported).toBe(true);
    expect(steps.checked).toBe(true);
    expect(steps.issued).toBe(true);
    // Дальше выпуска организация не ушла — рассылку не приписываем.
    expect(steps.mailed).toBe(false);
  });

  it('шаг проверки засчитывается и по правкам списка, и по запущенному выпуску', () => {
    expect(stepsReached({ ...nothing, hasRows: true, usedCheck: true }).checked).toBe(true);
    expect(stepsReached({ ...nothing, hasRows: true, startedJob: true }).checked).toBe(true);
    expect(stepsReached({ ...nothing, hasRows: true }).checked).toBe(false);
  });

  it('два материала за один день — это одно награждение, а не возвращение', () => {
    const oneEvent = stepsReached({ ...nothing, hasIssued: true, hasMailed: true, issueDays: 1 });
    expect(oneEvent.returned).toBe(false);

    const cameBack = stepsReached({ ...nothing, hasIssued: true, hasMailed: true, issueDays: 2 });
    expect(cameBack.returned).toBe(true);
  });

  it('считает организации по каждому шагу', () => {
    const counted = countSteps([
      stepsReached(nothing),
      stepsReached({ ...nothing, hasRows: true }),
      stepsReached({ ...nothing, hasIssued: true, hasMailed: true, issueDays: 2 }),
    ]);

    expect(counted.registered).toBe(3);
    expect(counted.imported).toBe(2);
    expect(counted.issued).toBe(1);
    expect(counted.returned).toBe(1);
    // Шаги идут по убыванию — иначе воронку нечем объяснить.
    const values = FUNNEL_STEPS.map((s) => counted[s]);
    expect(values).toEqual([...values].sort((a, b) => b - a));
  });
});

describe('медиана и доли', () => {
  it('медиана не поддаётся одному опоздавшему, в отличие от среднего', () => {
    // Среднее здесь — больше двух часов, медиана — четыре минуты.
    expect(median([3, 4, 5, 800])).toBe(5);
    expect(median([2, 4, 6])).toBe(4);
  });

  it('без единой величины медианы нет — это не ноль', () => {
    expect(median([])).toBeNull();
  });

  it('доля без знаменателя — тоже не ноль', () => {
    expect(share(3, 4)).toBe(0.75);
    expect(share(0, 0)).toBeNull();
  });

  it('время до первого документа не бывает отрицательным', () => {
    const from = new Date('2026-08-29T10:00:00Z');
    expect(minutesBetween(from, new Date('2026-08-29T10:07:30Z'))).toBe(7);
    expect(minutesBetween(from, new Date('2026-08-29T09:00:00Z'))).toBe(0);
  });
});

describe('месяц по Москве', () => {
  it('границы месяца считаются от Москвы, а не от времени сервера', () => {
    // 29 августа. Месяц начался 1 августа в 00:00 по Москве —
    // это 31 июля 21:00 по UTC.
    const { from, to } = monthRange(new Date('2026-08-29T10:00:00Z'));
    expect(from.toISOString()).toBe('2026-07-31T21:00:00.000Z');
    expect(to.toISOString()).toBe('2026-08-31T21:00:00.000Z');
  });

  it('прошлый месяц кончается там, где начинается текущий', () => {
    const current = monthRange(new Date('2026-08-29T10:00:00Z'));
    const previous = monthRange(new Date('2026-08-29T10:00:00Z'), 1);

    expect(previous.to.toISOString()).toBe(current.from.toISOString());
    expect(previous.from.toISOString()).toBe('2026-06-30T21:00:00.000Z');
  });

  it('январь берёт декабрь прошлого года', () => {
    const { from, to } = monthRange(new Date('2026-01-15T10:00:00Z'), 1);
    expect(from.toISOString()).toBe('2025-11-30T21:00:00.000Z');
    expect(to.toISOString()).toBe('2025-12-31T21:00:00.000Z');
  });

  it('полночь первого числа по Москве — это уже новый день', () => {
    expect(mskDay(new Date('2026-08-31T21:30:00Z'))).toBe('2026-09-01');
    expect(mskDay(new Date('2026-08-31T20:30:00Z'))).toBe('2026-08-31');
  });

  it('месяц называется по-русски и без сокращения «г.»', () => {
    // Заголовок попадает в середину предложения, где точка сокращения
    // столкнулась бы с точкой предложения.
    expect(monthTitle(new Date('2026-07-31T21:00:00Z'))).toBe('август 2026');
  });
});
