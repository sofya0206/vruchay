import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { OrgService } from './org.service';
import { testConfig } from '../config/env.test-utils';

/*
 * Остаток бесплатной пробы.
 *
 * Эта цифра стоит на главной странице кабинета, и по ней человек решает,
 * хватит ли ему на награждение. Она обязана совпадать с тем, что решит
 * проверка при выпуске: если в кабинете «осталось 20», а выпуск откажет,
 * доверия к сервису не останется.
 */

function serviceWith({ plan, used, bonus = 0 }: {
  plan: 'free' | 'paid';
  used: number;
  bonus?: number;
}): OrgService {
  const prisma = {
    organization: { findUnique: async () => ({ plan }) },
    file: { count: async () => used },
    user: { findUnique: async () => ({ name: 'Мария', email: 'm@example.test' }) },
  };
  const referral = { bonusDocuments: async () => bonus };
  return new OrgService(prisma as never, referral as never, testConfig() as never, {} as never);
}

describe('остаток пробы', () => {
  beforeEach(() => {
    process.env.FREE_DOCUMENT_LIMIT = '50';
  });
  afterEach(() => {
    delete process.env.FREE_DOCUMENT_LIMIT;
  });

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

describe('профиль', () => {
  it('отдаёт название организации, имя и адрес входа', async () => {
    const p = await serviceWith({ plan: 'free', used: 0 }).profile('org', 'user');
    expect(p.userName).toBe('Мария');
    expect(p.email).toBe('m@example.test');
    expect(p.plan).toBe('free');
  });
});
