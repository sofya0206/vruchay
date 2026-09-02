import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generatePublicCode } from '../../src/verify/public-code';
import { resetDatabase } from './support/db';
import { makeDocument, makeIssuedFile, makeOrg, makeRows } from './support/fixtures';
import { startApp, type IntegrationApp } from './support/app';

/**
 * Переход на короткий публичный код — на настоящей базе.
 *
 * Документы, выпущенные до появления кода, лежат в базе с одним лишь
 * UUID в `public_id`: ровно так их и заводит `makeIssuedFile`, и ровно
 * так они выглядят после миграции. Их QR уже напечатан — ссылка обязана
 * работать. Новые документы получают код, и страница проверки находит
 * их и по коду, и по прежнему UUID.
 */
describe('старый UUID и новый код на одной странице проверки', () => {
  let app: IntegrationApp;
  let orgId = '';
  let legacyPublicId = '';
  let freshCode = '';
  let freshPublicId = '';

  beforeAll(async () => {
    app = await startApp({ worker: false });
    await resetDatabase(app.prisma);

    const org = await makeOrg(app.prisma);
    orgId = org.id;
    const document = await makeDocument(app.prisma, org.id, { verifyFields: ['name'] });
    const [legacyRow, freshRow] = await makeRows(app.prisma, document.id, [
      { name: 'Иванов Пётр Ильич', email: 'ivanov@example.ru' },
      { name: 'Смирнова Анна Олеговна', email: 'smirnova@example.ru' },
    ]);

    // Выпуск до этой правки: кода нет, есть только UUID от базы.
    const legacy = await makeIssuedFile(app.prisma, {
      orgId: org.id,
      documentId: document.id,
      rowId: legacyRow.id,
    });
    legacyPublicId = legacy.publicId;
    expect(legacy.publicCode).toBeNull();

    // Выпуск после: код считается приложением тем же секретом,
    // что и у воркера.
    freshCode = generatePublicCode(process.env.SESSION_SECRET as string);
    const fresh = await app.prisma.file.update({
      where: {
        id: (
          await makeIssuedFile(app.prisma, {
            orgId: org.id,
            documentId: document.id,
            rowId: freshRow.id,
          })
        ).id,
      },
      data: { publicCode: freshCode },
    });
    freshPublicId = fresh.publicId;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('документ из старого QR находится по UUID и показывает его как код', async () => {
    const answer = await app.verify.check(legacyPublicId);
    expect(answer.valid).toBe(true);
    expect(answer.code).toBe(legacyPublicId);
    expect(answer.fields).toEqual({ name: 'Иванов Пётр Ильич' });
  });

  it('новый документ находится по короткому коду — и как напечатано, и как продиктовано', async () => {
    for (const typed of [freshCode, freshCode.toLowerCase().replace(/-/g, ' ')]) {
      const answer = await app.verify.check(typed);
      expect(answer.valid, typed).toBe(true);
      expect(answer.code).toBe(freshCode);
      expect(answer.fields).toEqual({ name: 'Смирнова Анна Олеговна' });
    }
  });

  it('у нового документа работает и старая форма ссылки', async () => {
    const answer = await app.verify.check(freshPublicId);
    expect(answer.valid).toBe(true);
    expect(answer.code).toBe(freshCode);
  });

  it('код второй раз не выдаётся: уникальность держит база', async () => {
    const org = await app.prisma.organization.findFirstOrThrow();
    const document = await app.prisma.document.findFirstOrThrow();
    const twin = await makeIssuedFile(app.prisma, { orgId: org.id, documentId: document.id });
    await expect(
      app.prisma.file.update({ where: { id: twin.id }, data: { publicCode: freshCode } }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('реестр ищет по короткому коду в любом написании', async () => {
    const page = await app.registry.list(orgId, {
      limit: 50,
      offset: 0,
      search: freshCode.toLowerCase().replace(/-/g, ''),
    });
    expect(page.total).toBe(1);
    expect(page.items[0].code).toBe(freshCode);
    expect(page.items[0].verifyPath).toBe(`/c/${freshCode}`);

    const legacy = await app.registry.list(orgId, { limit: 50, offset: 0, search: legacyPublicId });
    expect(legacy.total).toBe(1);
    expect(legacy.items[0].verifyPath).toBe(`/verify/${legacyPublicId}`);
  });
});
