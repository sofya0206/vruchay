import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { ReferralService } from './referral.service';
import { testConfig } from '../config/env.test-utils';

/*
 * Приглашение друга. Проверяем ровно то, что раздаёт бесплатные документы:
 * кому и сколько начисляется. Ошибка щедрости здесь стоит денег, ошибка
 * скупости — доверия того, кто позвал коллегу и ничего не получил.
 */

interface Org {
  id: string;
  name: string;
  /** Сколько документов эта организация уже выпустила. */
  issued: number;
}

function serviceWith(params: { referredBy?: string | null; invited?: Org[] }): ReferralService {
  const invited = params.invited ?? [];
  const prisma = {
    organization: {
      findUnique: async () => ({
        referredByOrgId: params.referredBy ?? null,
        referralCode: 'abc123',
        name: 'Наша федерация',
      }),
      findMany: async () =>
        invited.map((o) => ({ id: o.id, name: o.name, createdAt: new Date('2026-01-01') })),
      update: async () => ({}),
    },
    file: {
      groupBy: async () =>
        invited.map((o) => ({ orgId: o.id, _count: { _all: o.issued } })),
    },
  };
  return new ReferralService(prisma as never, testConfig() as never);
}

const org = (id: string, issued: number): Org => ({ id, name: `Организация ${id}`, issued });

describe('бонусы за приглашения', () => {
  beforeEach(() => {
    process.env.REFERRAL_WELCOME_BONUS = '50';
    process.env.REFERRAL_REWARD = '50';
    process.env.REFERRAL_QUALIFY_DOCUMENTS = '10';
    process.env.REFERRAL_MAX_REWARDED = '20';
  });
  afterEach(() => {
    delete process.env.REFERRAL_WELCOME_BONUS;
    delete process.env.REFERRAL_REWARD;
    delete process.env.REFERRAL_QUALIFY_DOCUMENTS;
    delete process.env.REFERRAL_MAX_REWARDED;
  });

  it('никого не звал и сам не пришёл по ссылке — бонуса нет', async () => {
    await expect(serviceWith({}).bonusDocuments('org')).resolves.toBe(0);
  });

  it('пришёл по приглашению — получает приветственный бонус сразу', async () => {
    // Именно сразу, а не после первой работы: это половина двустороннего
    // обещания, и приглашённый должен увидеть её в первую же минуту.
    await expect(serviceWith({ referredBy: 'friend' }).bonusDocuments('org')).resolves.toBe(50);
  });

  it('приглашённый зарегистрировался, но ничего не выпустил — бонуса нет', async () => {
    // Иначе бонусы печатались бы заведением пустых организаций.
    const svc = serviceWith({ invited: [org('a', 0)] });
    await expect(svc.bonusDocuments('org')).resolves.toBe(0);
  });

  it('приглашённый выпустил меньше порога — бонуса всё ещё нет', async () => {
    const svc = serviceWith({ invited: [org('a', 9)] });
    await expect(svc.bonusDocuments('org')).resolves.toBe(0);
  });

  it('ровно порог засчитывается', async () => {
    const svc = serviceWith({ invited: [org('a', 10)] });
    await expect(svc.bonusDocuments('org')).resolves.toBe(50);
  });

  it('считает каждого работающего друга', async () => {
    const svc = serviceWith({ invited: [org('a', 10), org('b', 40), org('c', 2)] });
    await expect(svc.bonusDocuments('org')).resolves.toBe(100);
  });

  it('приветственный бонус складывается с заработанным', async () => {
    const svc = serviceWith({ referredBy: 'friend', invited: [org('a', 10)] });
    await expect(svc.bonusDocuments('org')).resolves.toBe(100);
  });

  it('потолок не даёт раздать бесконечно', async () => {
    const invited = Array.from({ length: 30 }, (_, i) => org(`o${i}`, 50));
    await expect(serviceWith({ invited }).bonusDocuments('org')).resolves.toBe(20 * 50);
  });
});

describe('код приглашения', () => {
  it('не признаёт пустой и слишком короткий код', async () => {
    const svc = serviceWith({});
    await expect(svc.resolveCode('')).resolves.toBeNull();
    await expect(svc.resolveCode('ab')).resolves.toBeNull();
  });

  it('не пускает в запрос ничего, кроме букв и цифр', async () => {
    // Код приходит из адресной строки. Prisma параметризует запрос сама,
    // но пропускать в неё произвольную строку из внешнего мира незачем.
    const svc = serviceWith({});
    await expect(svc.resolveCode("abc' or 1=1--")).resolves.toBeNull();
    await expect(svc.resolveCode('абвгде')).resolves.toBeNull();
  });
});

describe('текст приглашения', () => {
  beforeEach(() => {
    process.env.REFERRAL_WELCOME_BONUS = '50';
    process.env.FREE_DOCUMENT_LIMIT = '50';
    process.env.PUBLIC_URL = 'https://vruchay.ru';
  });
  afterEach(() => {
    delete process.env.REFERRAL_WELCOME_BONUS;
    delete process.env.FREE_DOCUMENT_LIMIT;
    delete process.env.PUBLIC_URL;
  });

  it('готов к пересылке: есть ссылка и обещанное число документов', async () => {
    const svc = serviceWith({});
    const summary = await svc.summary('org', 'Федерация плавания');

    expect(summary.link).toBe('https://vruchay.ru/register?ref=abc123');
    expect(summary.message).toContain('https://vruchay.ru/register?ref=abc123');
    // 50 базовых + 50 приветственных: столько увидит приглашённый.
    expect(summary.message).toContain('100');
    expect(summary.message).toContain('Федерация плавания');
  });

  it('не ставит вторые кавычки, если они уже есть в названии', async () => {
    // Спортшколы сплошь и рядом называются «Спортшкола «Олимп»»,
    // и «Мы в «Спортшкола «Олимп»»» человек переслать постесняется.
    const svc = serviceWith({});
    const summary = await svc.summary('org', 'Спортшкола «Олимп»');
    expect(summary.message).toContain('Мы в Спортшкола «Олимп»');
    expect(summary.message).not.toContain('««');
  });
});
