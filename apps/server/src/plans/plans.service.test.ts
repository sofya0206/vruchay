import { describe, expect, it } from 'vitest';
import { fakePlans, planRecord } from './plans.test-utils';

/*
 * Одно место, которое знает, что организации положено.
 *
 * Раньше это знание лежало в трёх: выпуск, перевыпуск и цифра на главной
 * кабинета считали остаток каждый по-своему. С планами по договорённости
 * расхождение означало бы «в кабинете осталось двадцать, а выпуск отказал»,
 * то есть потерянное доверие ровно в тот момент, когда человек работает.
 */

const NOW = new Date('2026-08-29T12:00:00Z');

describe('что положено организации', () => {
  it('без плана и без оплаты — бесплатная проба', async () => {
    const quota = await fakePlans({ plan: 'free', used: 10, freeLimit: 50 }).quota(
      'org',
      undefined,
      NOW,
    );

    expect(quota.source).toBe('trial');
    expect(quota.limit).toBe(50);
    expect(quota.left).toBe(40);
  });

  it('приглашения прибавляются к пробе', async () => {
    const quota = await fakePlans({ plan: 'free', used: 60, bonus: 50, freeLimit: 50 }).quota(
      'org',
      undefined,
      NOW,
    );

    expect(quota.limit).toBe(100);
    expect(quota.bonus).toBe(50);
  });

  it('старый оплаченный тариф остаётся без предела', async () => {
    // Ограничений у него не было, и назначать их задним числом нельзя.
    const quota = await fakePlans({ plan: 'paid', used: 100_000 }).quota('org', undefined, NOW);

    expect(quota.source).toBe('legacy-paid');
    expect(quota.limit).toBeNull();
  });

  it('назначенный план важнее и пробы, и старого тарифа', async () => {
    const quota = await fakePlans({
      plan: 'free',
      used: 120,
      freeLimit: 50,
      plans: [planRecord({ documentLimit: 500 })],
    }).quota('org', undefined, NOW);

    expect(quota.source).toBe('plan');
    expect(quota.limit).toBe(500);
    expect(quota.left).toBe(380);
  });

  it('выпущенное считается с начала плана, а не за всё время', async () => {
    // План — это объём за период. Прошлогодние документы в него не входят,
    // иначе продление начиналось бы с уже исчерпанной квоты.
    const startsAt = new Date('2026-08-01T00:00:00Z');
    const quota = await fakePlans({
      plan: 'paid',
      // Файлы считаем по-настоящему: с условием «начиная с даты» — 30,
      // без условия — 900. Ответ обязан быть первым.
      used: (where) => ((where.createdAt as { gte?: Date } | undefined)?.gte ? 30 : 900),
      plans: [planRecord({ startsAt, documentLimit: 500 })],
    }).quota('org', undefined, NOW);

    expect(quota.used).toBe(30);
    expect(quota.left).toBe(470);
  });

  it('план, который ещё не начался, ничего не меняет', async () => {
    const quota = await fakePlans({
      plan: 'free',
      used: 0,
      freeLimit: 50,
      plans: [planRecord({ startsAt: new Date('2027-01-01') })],
    }).quota('org', undefined, NOW);

    expect(quota.source).toBe('trial');
  });

  it('истёкший план не превращается обратно в бесплатную пробу', async () => {
    // Иначе организация с кончившимся договором получала бы полсотни
    // документов сверх него — и узнавала об этом сама.
    const quota = await fakePlans({
      plan: 'paid',
      used: 500,
      freeLimit: 50,
      plans: [planRecord({ startsAt: new Date('2025-01-01'), endsAt: new Date('2026-01-01') })],
    }).quota('org', undefined, NOW);

    expect(quota.source).toBe('plan');
    expect(quota.expired).toBe(true);
    expect(quota.warn).toBe('expired');
  });

  it('несуществующую организацию не ограничиваем: падать на ровном месте хуже', async () => {
    const quota = await fakePlans({ missing: true }).quota('org', undefined, NOW);
    expect(quota.limit).toBeNull();
  });
});

describe('что разрешено спрашивают у плана', () => {
  it('входит в план — разрешено', async () => {
    const plans = fakePlans({ plan: 'paid', plans: [planRecord({ features: ['mailing'] })] });
    await expect(plans.allows('org', 'mailing')).resolves.toBe(true);
  });

  it('не входит — запрещено, и никакого `if` про название тарифа', async () => {
    const plans = fakePlans({ plan: 'paid', plans: [planRecord({ features: ['mailing'] })] });
    await expect(plans.allows('org', 'api')).resolves.toBe(false);
  });
});
