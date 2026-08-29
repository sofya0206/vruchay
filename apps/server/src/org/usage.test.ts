import { describe, expect, it } from 'vitest';
import { OrgService } from './org.service';
import { PlansService } from '../plans/plans.service';
import { testConfig } from '../config/env.test-utils';
import { planRecord } from '../plans/plans.test-utils';
import type { PlanRecord } from '../plans/plan';

/*
 * Остаток бесплатной пробы.
 *
 * Эта цифра стоит на главной странице кабинета, и по ней человек решает,
 * хватит ли ему на награждение. Она обязана совпадать с тем, что решит
 * проверка при выпуске: если в кабинете «осталось 20», а выпуск откажет,
 * доверия к сервису не останется.
 */

function serviceWith({ plan, used, bonus = 0, plans = [] }: {
  plan: 'free' | 'paid';
  used: number;
  bonus?: number;
  plans?: PlanRecord[];
}): OrgService {
  const prisma = {
    organization: { findUnique: async () => ({ plan }) },
    plan: { findMany: async () => plans },
    file: { count: async () => used },
    user: { findUnique: async () => ({ name: 'Мария', email: 'm@example.test' }) },
  };
  const referral = { bonusDocuments: async () => bonus };
  // Предел пробы служба берёт из проверенной схемы настроек, а не из окружения.
  const config = testConfig({ FREE_DOCUMENT_LIMIT: '50' });
  return new OrgService(prisma as never, new PlansService(prisma as never, referral as never, config as never));
}

describe('остаток пробы', () => {

  it('новая организация: всё в запасе', async () => {
    const u = await serviceWith({ plan: 'free', used: 0 }).usage('org');
    expect(u).toMatchObject({ plan: 'free', used: 0, limit: 50, left: 50, bonus: 0 });
  });

  it('часть израсходована', async () => {
    const u = await serviceWith({ plan: 'free', used: 18 }).usage('org');
    expect(u.left).toBe(32);
  });

  it('приглашения прибавляются и к пределу, и к остатку', async () => {
    const u = await serviceWith({ plan: 'free', used: 60, bonus: 50 }).usage('org');
    expect(u.limit).toBe(100);
    expect(u.left).toBe(40);
    expect(u.bonus).toBe(50);
  });

  it('не уходит в минус, если выпущено больше предела', async () => {
    // Так бывает после перевода организации с оплаченного тарифа обратно.
    // «Осталось −30» на главной выглядело бы поломкой.
    const u = await serviceWith({ plan: 'free', used: 80 }).usage('org');
    expect(u.left).toBe(0);
  });

  it('на оплаченном тарифе предела нет, и считать нечего', async () => {
    const u = await serviceWith({ plan: 'paid', used: 100_000 }).usage('org');
    expect(u).toMatchObject({ plan: 'paid', limit: null, left: null });
  });
});

describe('остаток по назначенному плану', () => {
  it('считает от плана, а не от бесплатной пробы', async () => {
    const u = await serviceWith({
      plan: 'paid',
      used: 120,
      plans: [planRecord({ name: '500 документов на год', documentLimit: 500 })],
    }).usage('org');

    expect(u.planName).toBe('500 документов на год');
    expect(u.limit).toBe(500);
    expect(u.left).toBe(380);
    expect(u.warn).toBe('none');
  });

  it('на девяноста процентах предупреждает', async () => {
    // Ровно приёмка задания: план на 500, выпущено 450 — человек должен
    // узнать об этом до того, как список получателей окажется длиннее остатка.
    const u = await serviceWith({
      plan: 'paid',
      used: 450,
      plans: [planRecord({ documentLimit: 500 })],
    }).usage('org');

    expect(u.left).toBe(50);
    expect(u.warn).toBe('critical');
  });

  it('на восьмидесяти процентах предупреждает мягко', async () => {
    const u = await serviceWith({
      plan: 'paid',
      used: 400,
      plans: [planRecord({ documentLimit: 500 })],
    }).usage('org');

    expect(u.warn).toBe('low');
  });

  it('исчерпанный план виден как исчерпанный, а не как «осталось 0»', async () => {
    const u = await serviceWith({
      plan: 'paid',
      used: 500,
      plans: [planRecord({ documentLimit: 500 })],
    }).usage('org');

    expect(u.left).toBe(0);
    expect(u.warn).toBe('exhausted');
  });

  it('после окончания срока говорит именно об окончании срока', async () => {
    const u = await serviceWith({
      plan: 'paid',
      used: 10,
      plans: [
        planRecord({
          startsAt: new Date('2020-01-01'),
          endsAt: new Date('2021-01-01'),
        }),
      ],
    }).usage('org');

    expect(u.expired).toBe(true);
    expect(u.warn).toBe('expired');
  });
});

describe('профиль', () => {
  it('отдаёт название организации, имя и адрес входа', async () => {
    const p = await serviceWith({ plan: 'free', used: 0 }).profile('org', 'user');
    expect(p.userName).toBe('Мария');
    expect(p.email).toBe('m@example.test');
    expect(p.plan).toBe('free');
  });
});
