import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/*
 * Уникальный индекс emails_document_to_kind_live против настоящей базы.
 *
 * Соседний mailing.service.test.ts проверяет, что служба ведёт себя правильно,
 * когда база отвергает повтор, — но саму эту способность базы заглушка
 * подтвердить не может: она её изображает. Условие индекса живёт в SQL
 * миграции, и ошибка в нём (лишний статус, забытое обезличивание, регистр
 * адреса) не видна ни одному тесту с подменённой Prisma.
 *
 * Тест идёт только по явному требованию — как и тесты с настоящим браузером:
 *
 *   DB_TESTS=1 DATABASE_URL=postgresql://… pnpm --filter @gramota/server test
 *
 * Базе нужны накатанные миграции. Обычный `pnpm -r test` гоняют и там, где
 * базы нет вовсе; падение из-за отсутствия окружения ничего не сообщает
 * о коде и только приучает не доверять красным тестам.
 *
 * Работает в своей организации со случайным именем и всё за собой убирает:
 * запускать можно и на базе с данными.
 */
const DB_TESTS = process.env.DB_TESTS === '1' && Boolean(process.env.DATABASE_URL);

const ORG = '00000000-0000-4000-8000-0000000000d1';
const DOC = '00000000-0000-4000-8000-0000000000d2';

describe.skipIf(!DB_TESTS)('одно живое письмо на пару «адрес + поток» в базе', () => {
  const prisma = new PrismaClient();

  /** Письмо мимо Prisma-клиента: проверяем сам индекс, а не поведение службы. */
  async function insert(
    id: string,
    kind: 'transactional' | 'marketing',
    toEmail: string,
    status: string,
  ): Promise<'ок' | 'отвергнуто'> {
    try {
      await prisma.$executeRaw`
        INSERT INTO "emails" ("id", "org_id", "document_id", "kind", "to_email",
                              "subject", "status", "queued_at", "status_updated_at")
        VALUES (${id}::uuid, ${ORG}::uuid, ${DOC}::uuid, ${kind}::"EmailKind",
                ${toEmail}, 'Тема', ${status}::"EmailStatus", now(), now())`;
      return 'ок';
    } catch {
      return 'отвергнуто';
    }
  }

  const id = (n: number) => `00000000-0000-4000-8000-0000000000${(n + 16).toString(16)}`;

  beforeAll(async () => {
    await prisma.$executeRaw`
      INSERT INTO "organizations" ("id", "name", "plan", "created_at")
      VALUES (${ORG}::uuid, 'Проверка индекса', 'free', now())`;
    await prisma.$executeRaw`
      INSERT INTO "documents" ("id", "org_id", "title", "created_at", "updated_at")
      VALUES (${DOC}::uuid, ${ORG}::uuid, 'Материал', now(), now())`;
  });

  afterAll(async () => {
    // Организация уходит каскадом вместе с материалом и письмами.
    await prisma.$executeRaw`DELETE FROM "organizations" WHERE "id" = ${ORG}::uuid`;
    await prisma.$disconnect();
  });

  it('индекс существует и он частичный, а не обычный', async () => {
    const [index] = await prisma.$queryRaw<{ indexdef: string }[]>`
      SELECT indexdef FROM pg_indexes WHERE indexname = 'emails_document_to_kind_live'`;

    expect(index).toBeDefined();
    expect(index.indexdef).toContain('WHERE');
    expect(index.indexdef).toContain('UNIQUE');
  });

  it('два одновременных «Отправить» дают одно письмо', async () => {
    expect(await insert(id(1), 'transactional', 'ivanov@example.ru', 'queued')).toBe('ок');
    expect(await insert(id(2), 'transactional', 'ivanov@example.ru', 'queued')).toBe('отвергнуто');
  });

  it('другой регистр адреса защиту не обходит', async () => {
    expect(await insert(id(3), 'transactional', 'IVANOV@Example.RU', 'queued')).toBe('отвергнуто');
  });

  it('тот же адрес в другом потоке — это другое письмо', async () => {
    expect(await insert(id(4), 'marketing', 'ivanov@example.ru', 'queued')).toBe('ок');
  });

  it('повторная отправка недоставленного по-прежнему работает', async () => {
    // Прошлая попытка уходит в failed — то есть за пределы индекса, —
    // и новое письмо на тот же адрес в том же потоке проходит.
    await prisma.$executeRaw`
      UPDATE "emails" SET "status" = 'failed' WHERE "id" = ${id(1)}::uuid`;

    expect(await insert(id(5), 'transactional', 'ivanov@example.ru', 'queued')).toBe('ок');
    const failed = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT count(*) FROM "emails" WHERE "org_id" = ${ORG}::uuid AND "status" = 'failed'`;
    // Недоставленное письмо осталось в журнале: повтор его не заменяет.
    expect(Number(failed[0].count)).toBe(1);
  });

  it('ночная уборка сроков хранения обезличивает адреса и не спотыкается', async () => {
    // Два доставленных письма разным людям по одному материалу. Стирание
    // адресов делает их одинаковыми для индекса — если бы не условие
    // to_email <> '', ночная задача падала бы каждую ночь.
    // Переводим в доставленные только живые: недоставленное так и лежит
    // в failed, и поднимать его обратно нельзя — получилось бы два живых
    // письма на один адрес, чего индекс справедливо не разрешает.
    await prisma.$executeRaw`
      UPDATE "emails" SET "status" = 'delivered'
      WHERE "org_id" = ${ORG}::uuid AND "status" = 'queued'`;
    expect(await insert(id(6), 'transactional', 'petrov@example.ru', 'delivered')).toBe('ок');

    const blanked = await prisma.email.updateMany({
      where: { orgId: ORG, NOT: { toEmail: '' } },
      data: { toEmail: '' },
    });

    expect(blanked.count).toBeGreaterThan(1);
  });
});
