import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PlansService } from './plans.service';
import { testConfig } from '../config/env.test-utils';

/*
 * Планы против настоящей базы.
 *
 * Заглушка Prisma в соседних тестах подтверждает поведение службы, но не
 * способность базы: список возможностей — колонка-массив, период —
 * перечисление, а израсходованное считается условием «файлы начиная
 * с даты начала плана». Ошибка в любом из трёх не видна ни одному тесту
 * с подменённой Prisma и вылезет на первом же клиенте с назначенным планом.
 *
 * Тест идёт только по явному требованию — как и тесты с настоящим браузером:
 *
 *   DB_TESTS=1 DATABASE_URL=postgresql://… pnpm --filter @gramota/server test
 *
 * Базе нужны накатанные миграции. Обычный `pnpm -r test` гоняют и там, где
 * базы нет вовсе; падение из-за отсутствия окружения ничего не сообщает
 * о коде и только приучает не доверять красным тестам.
 *
 * Работает в своей организации и всё за собой убирает: запускать можно
 * и на базе с данными.
 */
const DB_TESTS = process.env.DB_TESTS === '1' && Boolean(process.env.DATABASE_URL);

const ORG = '00000000-0000-4000-8000-000000000a10';
const DOC = '00000000-0000-4000-8000-000000000a11';

const DAY = 24 * 60 * 60_000;

describe.skipIf(!DB_TESTS)('план в настоящей базе', () => {
  const prisma = new PrismaClient();
  const plans = new PlansService(
    prisma as never,
    { bonusDocuments: async () => 0 } as never,
    testConfig({ FREE_DOCUMENT_LIMIT: '50' }) as never,
  );

  /** Выпущенный документ с заданной датой: по ним и считается расход. */
  async function issue(n: number, createdAt: Date): Promise<void> {
    await prisma.$executeRaw`
      INSERT INTO "files" ("id", "org_id", "document_id", "kind", "s3_key", "mime",
                           "size_bytes", "public_id", "original_name", "created_at")
      VALUES (gen_random_uuid(), ${ORG}::uuid, ${DOC}::uuid, 'generated'::"FileKind",
              ${`key-${n}`}, 'application/pdf', 1, gen_random_uuid(), '', ${createdAt})`;
  }

  beforeAll(async () => {
    await prisma.$executeRaw`
      INSERT INTO "organizations" ("id", "name", "plan", "created_at")
      VALUES (${ORG}::uuid, 'Проверка планов', 'free', now())`;
    await prisma.$executeRaw`
      INSERT INTO "documents" ("id", "org_id", "title", "created_at", "updated_at")
      VALUES (${DOC}::uuid, ${ORG}::uuid, 'Материал', now(), now())`;
  });

  afterAll(async () => {
    await prisma.$executeRaw`DELETE FROM "files" WHERE "org_id" = ${ORG}::uuid`;
    await prisma.$executeRaw`DELETE FROM "plans" WHERE "org_id" = ${ORG}::uuid`;
    await prisma.$executeRaw`DELETE FROM "documents" WHERE "org_id" = ${ORG}::uuid`;
    await prisma.$executeRaw`DELETE FROM "organizations" WHERE "id" = ${ORG}::uuid`;
    await prisma.$disconnect();
  });

  it('без плана организация сидит на бесплатной пробе', async () => {
    const quota = await plans.quota(ORG);
    expect(quota.source).toBe('trial');
    expect(quota.limit).toBe(50);
  });

  it('назначенный план сохраняется целиком и становится действующим', async () => {
    // Три вещи, которых заглушка проверить не может: массив возможностей,
    // перечисление периода и то, что запись вообще проходит проверки базы.
    await plans.assign(
      ORG,
      {
        name: '500 документов на год',
        documentLimit: 500,
        period: 'year',
        startsAt: new Date(Date.now() - DAY),
        endsAt: new Date(Date.now() + 365 * DAY),
        features: ['mailing', 'api'],
        neverExpires: false,
        note: 'Договорились на звонке',
      },
      'sofia@vruchay.ru',
    );

    const quota = await plans.quota(ORG);
    expect(quota.source).toBe('plan');
    expect(quota.name).toBe('500 документов на год');
    expect(quota.limit).toBe(500);
    expect(quota.features).toEqual(['mailing', 'api']);
    expect(quota.period).toBe('year');
  });

  it('израсходованным считается выпущенное с начала плана, а не за всё время', async () => {
    // Прошлогодние документы в объём этого года не входят, иначе продление
    // начиналось бы с уже исчерпанной квоты.
    await issue(1, new Date(Date.now() - 400 * DAY));
    await issue(2, new Date(Date.now() - 400 * DAY));
    await issue(3, new Date());

    const quota = await plans.quota(ORG);

    expect(quota.used).toBe(1);
    expect(quota.left).toBe(499);
  });

  it('новый план вытесняет прежний, а прежний остаётся в истории', async () => {
    await plans.assign(ORG, {
      name: 'Пакет 100',
      documentLimit: 100,
      period: 'package',
      startsAt: new Date(),
      endsAt: null,
      features: ['mailing'],
      neverExpires: true,
    });

    const quota = await plans.quota(ORG);
    expect(quota.name).toBe('Пакет 100');
    expect(quota.neverExpires).toBe(true);

    const history = await plans.history(ORG);
    expect(history.map((p) => p.name)).toContain('500 документов на год');
  });

  it('план, кончившийся вчера, не возвращает организацию на пробу', async () => {
    // Прежние планы убираем: живой пакет рядом с истёкшим — это не
    // «всё кончилось», а «действует свежий», и он действительно должен
    // побеждать. Здесь проверяется другой случай — когда не осталось ничего.
    await prisma.plan.deleteMany({ where: { orgId: ORG } });

    await plans.assign(ORG, {
      name: 'Пакет 10',
      documentLimit: 10,
      period: 'package',
      startsAt: new Date(Date.now() - 2 * DAY),
      endsAt: new Date(Date.now() - DAY),
      features: [],
      neverExpires: false,
    });

    const quota = await plans.quota(ORG);
    expect(quota.source).toBe('plan');
    expect(quota.expired).toBe(true);
    expect(quota.warn).toBe('expired');
  });
});
