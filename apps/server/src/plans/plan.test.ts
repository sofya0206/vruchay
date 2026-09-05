import { describe, expect, it } from 'vitest';
import {
  allows,
  isExpired,
  legacyPaidQuota,
  pickPlan,
  planQuota,
  refusal,
  trialQuota,
  warnLevel,
} from './plan';
import { planRecord } from './plans.test-utils';

/*
 * План как данные.
 *
 * Здесь проверяется то, из-за чего вся затея и начиналась: условия клиента
 * меняются разговором, а не релизом. Ошибка в этой арифметике либо пускает
 * мимо кассы, либо останавливает награждение на середине, и оба исхода
 * замечает не разработчик, а клиент.
 */

const NOW = new Date('2026-08-29T12:00:00Z');

describe('какой план действует', () => {
  it('без планов — никакого', () => {
    expect(pickPlan([], NOW)).toBeNull();
  });

  it('план, который ещё не начался, не действует', () => {
    const future = planRecord({ startsAt: new Date('2027-01-01') });
    expect(pickPlan([future], NOW)).toBeNull();
  });

  it('из нескольких берётся последний начавшийся', () => {
    const old = planRecord({ id: 'старый', startsAt: new Date('2025-01-01'), endsAt: null });
    const fresh = planRecord({ id: 'свежий', startsAt: new Date('2026-06-01'), endsAt: null });
    expect(pickPlan([old, fresh], NOW)?.id).toBe('свежий');
  });

  it('истёкший уступает действующему, даже если начался позже', () => {
    // Так выглядит продление задним числом: сначала завели годовой,
    // потом добавили пакет, у которого срок уже вышел.
    const live = planRecord({ id: 'живой', startsAt: new Date('2026-01-01'), endsAt: null });
    const dead = planRecord({
      id: 'истёкший',
      startsAt: new Date('2026-05-01'),
      endsAt: new Date('2026-06-01'),
    });
    expect(pickPlan([live, dead], NOW)?.id).toBe('живой');
  });

  it('когда истекли все, действующим считается последний истёкший', () => {
    // Иначе организация с кончившимся договором молча проваливалась бы
    // на бесплатную пробу и получала полсотни документов сверх него.
    const dead = planRecord({ startsAt: new Date('2025-01-01'), endsAt: new Date('2025-06-01') });
    expect(pickPlan([dead], NOW)?.id).toBe(dead.id);
  });
});

describe('когда план сгорает', () => {
  it('до даты окончания — не сгорел', () => {
    expect(isExpired(planRecord({ endsAt: new Date('2027-01-01') }), NOW)).toBe(false);
  });

  it('после даты окончания — сгорел', () => {
    expect(isExpired(planRecord({ endsAt: new Date('2026-01-01') }), NOW)).toBe(true);
  });

  it('без даты окончания не сгорает никогда', () => {
    expect(isExpired(planRecord({ endsAt: null }), NOW)).toBe(false);
  });

  it('«пакет не сгорает» переживает собственную дату окончания', () => {
    const plan = planRecord({
      period: 'package',
      endsAt: new Date('2026-01-01'),
      neverExpires: true,
    });
    expect(isExpired(plan, NOW)).toBe(false);
    // И остаток по нему по-прежнему считается.
    expect(planQuota(plan, 100, NOW).left).toBe(400);
  });
});

describe('предупреждение до того, как стало поздно', () => {
  it('пока запас велик — молчим', () => {
    expect(warnLevel(500, 300)).toBe('none');
  });

  it('осталось двадцать процентов — мягкое предупреждение', () => {
    expect(warnLevel(500, 100)).toBe('low');
  });

  it('осталось десять процентов — срочное', () => {
    expect(warnLevel(500, 50)).toBe('critical');
  });

  it('ноль — это не предупреждение, а исчерпание', () => {
    expect(warnLevel(500, 0)).toBe('exhausted');
  });

  it('истёкший срок важнее любого остатка', () => {
    expect(warnLevel(500, 400, true)).toBe('expired');
  });

  it('без предела предупреждать не о чем', () => {
    expect(warnLevel(null, null)).toBe('none');
  });
});

describe('что разрешено', () => {
  it('план перечисляет возможности — их и разрешает', () => {
    const quota = planQuota(planRecord({ features: ['mailing'] }), 0, NOW);
    expect(allows(quota, 'mailing')).toBe(true);
    expect(allows(quota, 'api')).toBe(false);
  });

  it('на пробе и на старом оплаченном тарифе разрешено всё', () => {
    // Отнимать задним числом то, что работало, нельзя: человек платил
    // за другое, и первым, что он увидит, будет отказ посреди работы.
    expect(allows(trialQuota(50, 0, 0), 'mailing')).toBe(true);
    expect(allows(legacyPaidQuota(1000), 'api')).toBe(true);
  });

  it('после окончания срока не разрешено ничего сверх выданного', () => {
    const quota = planQuota(planRecord({ endsAt: new Date('2026-01-01') }), 0, NOW);
    expect(allows(quota, 'mailing')).toBe(false);
  });

  it('незнакомая возможность из базы правом не становится', () => {
    // Так выглядит план, заведённый до переименования возможности.
    const quota = planQuota(planRecord({ features: ['mailing', 'телепатия'] }), 0, NOW);
    expect(quota.features).toEqual(['mailing']);
  });
});

describe('отказ словами', () => {
  const exhausted = planQuota(planRecord({ name: 'Пакет 500', documentLimit: 500 }), 500, NOW);

  it('называет план, остаток и то, что делать дальше', () => {
    const text = refusal({ quota: exhausted, adding: 10, reserved: 0 });
    expect(text).toContain('Пакет 500');
    expect(text).toContain('500 документов из 500');
    expect(text).toContain('обсудим условия');
  });

  it('обещает, что начатый выпуск дойдёт до конца', () => {
    // Это первое, что человек спрашивает, увидев отказ посреди награждения.
    expect(refusal({ quota: exhausted, adding: 1, reserved: 0 })).toContain('дойдёт до конца');
  });

  it('про бронь говорит отдельно: иначе цифра выглядит ошибкой сервиса', () => {
    const quota = planQuota(planRecord({ documentLimit: 500 }), 400, NOW);
    expect(refusal({ quota, adding: 200, reserved: 100 })).toContain(
      '100 держит незаконченный выпуск',
    );
  });

  it('при истёкшем сроке обещает, что выданное остаётся действительным', () => {
    const quota = planQuota(planRecord({ endsAt: new Date('2026-01-01') }), 10, NOW);
    const text = refusal({ quota, adding: 1, reserved: 0 });
    expect(text).toContain('Срок плана');
    expect(text).toContain('остаются действительными');
    expect(text).toContain('QR');
  });

  it('в отказе нет тупика ни при каком раскладе', () => {
    // «Лимит исчерпан» без продолжения — это человек с готовым списком
    // участников, которому некуда нажать. Он не заплатит, он уйдёт.
    const cases = [
      refusal({ quota: exhausted, adding: 1, reserved: 0 }),
      refusal({ quota: planQuota(planRecord(), 400, NOW), adding: 200, reserved: 0 }),
      refusal({ quota: trialQuota(50, 0, 50), adding: 1, reserved: 0 }),
      refusal({ quota: trialQuota(50, 0, 45), adding: 10, reserved: 0 }),
    ];
    for (const text of cases) {
      expect(text).toMatch(/обсудим условия|Пригласить друга/);
    }
  });
});
