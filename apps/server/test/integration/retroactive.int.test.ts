import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resetDatabase } from './support/db';
import { makeDocument, makeIssuedFile, makeOrg, makeRows } from './support/fixtures';
import { startApp, type IntegrationApp } from './support/app';

/**
 * Ретроактивные правки и массовый отзыв — на настоящей базе.
 *
 * Правило 3.3(7): название мероприятия и прочие сведения материала
 * применяются ко всем ранее выданным документам, а ФИО и всё, что
 * влияет на SHA-256 уже выданного PDF, — нет. Держится это снимком
 * данных на момент выпуска: страница проверки читает его, а не живую
 * строку таблицы, которую потом правят перед перевыпуском.
 */
describe('ретроактивные правки и массовый отзыв', () => {
  let app: IntegrationApp;
  let orgId = '';
  let documentId = '';
  let rowId = '';
  let publicId = '';

  beforeAll(async () => {
    app = await startApp({ worker: false });
    await resetDatabase(app.prisma);

    const org = await makeOrg(app.prisma);
    orgId = org.id;
    const document = await makeDocument(app.prisma, orgId, {
      title: 'Диплом',
      eventName: 'Первенство области',
      verifyFields: ['name'],
    });
    documentId = document.id;
    const [row] = await makeRows(app.prisma, documentId, [
      { name: 'Иванов Пётр Ильич', email: 'ivanov@example.ru' },
      { name: 'Смирнова Анна', email: 'smirnova@example.ru' },
    ]);
    rowId = row.id;

    // Как воркер: снимок строки в момент печати лежит на файле.
    const file = await makeIssuedFile(app.prisma, { orgId, documentId, rowId });
    await app.prisma.file.update({
      where: { id: file.id },
      data: { issuedData: { name: 'Иванов Пётр Ильич', email: 'ivanov@example.ru' } },
    });
    publicId = file.publicId;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('правка ФИО в таблице не меняет страницу проверки выданного документа', async () => {
    await app.recipients.updateRow(orgId, documentId, rowId, {
      data: { name: 'Иванов Петр Ильич' },
    });

    const answer = await app.verify.check(publicId);
    // На странице — то, что напечатано, а не исправленная строка.
    expect(answer.fields).toEqual({ name: 'Иванов Пётр Ильич' });

    // Строка при этом поправлена: она источник для перевыпуска.
    const row = await app.prisma.recipientRow.findUniqueOrThrow({ where: { id: rowId } });
    expect((row.data as Record<string, string>).name).toBe('Иванов Петр Ильич');
  });

  it('правка названия мероприятия и материала применяется ко всем выданным', async () => {
    await app.documents.update(orgId, documentId, {
      title: 'Диплом победителя',
      eventName: 'Первенство области по плаванию',
    });

    const answer = await app.verify.check(publicId);
    expect(answer.title).toBe('Диплом победителя');
    expect(answer.event.name).toBe('Первенство области по плаванию');
    // Снимок получателя от этого не изменился.
    expect(answer.fields).toEqual({ name: 'Иванов Пётр Ильич' });
  });

  it('у снимка данных нет пути наружу: ни одна ручка материала его не принимает', async () => {
    // Попытка протащить снимок через правку материала отсеивается схемой,
    // а не сервисом: до базы такой запрос не доходит.
    const { updateDocumentSchema } = await import('../../src/documents/documents.dto');
    const smuggled = updateDocumentSchema.safeParse({ issuedData: { name: 'Другой' } });
    expect(smuggled.success).toBe(false);

    const { updateRowSchema } = await import('../../src/recipients/recipients.dto');
    const viaRow = updateRowSchema.safeParse({ issuedData: { name: 'Другой' } });
    expect(viaRow.success).toBe(false);
  });

  it('массовый отзыв по материалу: предпросмотр, подтверждение по числу, причины', async () => {
    const second = await app.prisma.recipientRow.findFirstOrThrow({
      where: { documentId, position: 1 },
    });
    await makeIssuedFile(app.prisma, { orgId, documentId, rowId: second.id });

    const preview = await app.registryActions.previewRevoke(orgId, { filter: { documentId } });
    expect(preview.count).toBe(2);
    expect(preview.alreadyRevoked).toBe(0);
    expect(preview.sample.map((s) => s.name).sort()).toEqual(
      ['Иванов Петр Ильич', 'Смирнова Анна'].sort(),
    );

    // Число не сходится — ничего не отозвано.
    await expect(
      app.registryActions.setRevoked(orgId, { filter: { documentId } }, true, {
        expectedCount: 1,
      }),
    ).rejects.toThrow('Список изменился');
    expect(await app.prisma.file.count({ where: { orgId, verifyRevoked: true } })).toBe(0);

    const result = await app.registryActions.setRevoked(orgId, { filter: { documentId } }, true, {
      expectedCount: 2,
      reasonPublic: 'Ошибка в протоколе',
      reasonInternal: 'Письмо судьи',
    });
    expect(result.changed).toBe(2);

    const answer = await app.verify.check(publicId);
    expect(answer.state).toBe('revoked');
    expect(answer.revokedReason).toBe('Ошибка в протоколе');
    expect(answer.revokedAt).not.toBeNull();

    // Внутренняя причина — только владельцу и управляющему.
    const asMember = await app.registry.list(orgId, { limit: 50, offset: 0 }, false);
    expect(asMember.items.every((i) => i.revokedReasonInternal === null)).toBe(true);
    const asOwner = await app.registry.list(orgId, { limit: 50, offset: 0 }, true);
    expect(asOwner.items.map((i) => i.revokedReasonInternal)).toEqual([
      'Письмо судьи',
      'Письмо судьи',
    ]);
    expect(asOwner.items.every((i) => i.revokedReasonPublic === 'Ошибка в протоколе')).toBe(true);
  });

  it('чужой отбор ничего не отзывает', async () => {
    const stranger = await makeOrg(app.prisma, { name: 'Чужая' });
    await expect(
      app.registryActions.setRevoked(stranger.id, { filter: { documentId } }, false, {
        expectedCount: 2,
      }),
    ).rejects.toThrow('Ни один из документов не найден');
  });
});
