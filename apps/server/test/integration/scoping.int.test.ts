import { NotFoundException, type HttpException } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resetDatabase } from './support/db';
import { makeDocument, makeIssuedFile, makeOrg, makeRows } from './support/fixtures';
import { startApp, type IntegrationApp } from './support/app';

/**
 * Чужое — «не найдено», а не «нельзя».
 *
 * Правило проекта (CLAUDE.md, пункт про BOLA/IDOR): ответ 403 подтверждает,
 * что объект существует, и перебор идентификаторов превращается в разведку
 * чужой базы. Поэтому все запросы фильтруются по `orgId` из сессии,
 * а не по значению из тела запроса.
 *
 * Проверять это на двойниках бессмысленно: двойник отвечает то, что ему
 * велели, и «404» в нём — это утверждение теста, а не поведение запроса.
 * Здесь у обеих организаций есть настоящие записи в одной базе, и ответ
 * даёт настоящий фильтр Prisma.
 */
describe('доступ к чужому: 404, а не 403', () => {
  let app: IntegrationApp;

  const mine = { orgId: '', documentId: '', fileId: '', rowId: '' };
  const theirs = { orgId: '', documentId: '', fileId: '', rowId: '', publicId: '' };

  beforeAll(async () => {
    app = await startApp({ worker: false });
    await resetDatabase(app.prisma);

    for (const [name, side] of [
      ['Наша федерация', mine],
      ['Чужая федерация', theirs],
    ] as const) {
      const org = await makeOrg(app.prisma, { name });
      const document = await makeDocument(app.prisma, org.id, { title: `Грамота ${name}` });
      const [row] = await makeRows(app.prisma, document.id, [
        { name: 'Иванов Пётр Ильич', email: 'ivanov@example.ru' },
      ]);
      const file = await makeIssuedFile(app.prisma, {
        orgId: org.id,
        documentId: document.id,
        rowId: row.id,
      });
      side.orgId = org.id;
      side.documentId = document.id;
      side.fileId = file.id;
      side.rowId = row.id;
      if ('publicId' in side) side.publicId = file.publicId;
    }
  });

  afterAll(async () => {
    await app?.close();
  });

  /** Ответ обязан быть «не найдено» — и по коду, и по словам. */
  async function expectsNotFound(what: string, call: () => Promise<unknown>) {
    let thrown: unknown;
    try {
      await call();
    } catch (err) {
      thrown = err;
    }

    expect(thrown, `${what}: чужое отдалось вместо отказа`).toBeInstanceOf(NotFoundException);
    const status = (thrown as HttpException).getStatus();
    expect(status, `${what}: ответ подтверждает существование чужого объекта`).toBe(404);
  }

  it('чужой материал не открывается', async () => {
    await expectsNotFound('карточка материала', () =>
      app.documents.getOrFail(mine.orgId, theirs.documentId),
    );
    await expectsNotFound('таблица получателей', () =>
      app.recipients.getTable(mine.orgId, theirs.documentId),
    );
    await expectsNotFound('проверка списка', () =>
      app.validation.validate(mine.orgId, theirs.documentId, { scope: 'checked' }),
    );
    await expectsNotFound('выпуск', () =>
      app.generation.start(mine.orgId, theirs.documentId, 'pdf'),
    );
    await expectsNotFound('шаблон письма', () =>
      app.mailing.getTemplate(mine.orgId, theirs.documentId, 'transactional'),
    );
  });

  it('чужая строка реестра получателей не правится и не удаляется', async () => {
    await expectsNotFound('правка строки', () =>
      app.recipients.updateRow(mine.orgId, theirs.documentId, theirs.rowId, {
        data: { name: 'Подменённый Иван' },
      }),
    );
    await expectsNotFound('удаление строки', () =>
      app.recipients.deleteRow(mine.orgId, theirs.documentId, theirs.rowId),
    );

    // Ответ отказом — половина дела: важно, что запись не изменилась.
    const row = await app.prisma.recipientRow.findUniqueOrThrow({ where: { id: theirs.rowId } });
    expect((row.data as Record<string, string>).name).toBe('Иванов Пётр Ильич');
  });

  it('чужой выданный документ не виден в реестре и не открывается карточкой', async () => {
    await expectsNotFound('карточка выданного', () =>
      app.registry.detail(mine.orgId, theirs.fileId, true),
    );

    const page = await app.registry.list(mine.orgId, { limit: 50, offset: 0 });
    expect(page.total).toBe(1);
    expect(page.items.map((i) => i.fileId)).toEqual([mine.fileId]);
  });

  it('массовое действие по чужому идентификатору ничего не меняет', async () => {
    // Здесь ответ не 404: пачка могла быть смешанной, и «ни один
    // не найден» — это отказ по запросу целиком, а не сведения
    // о конкретном чужом документе. Проверяем главное: чужой файл
    // не тронут и существование его не подтверждено.
    await expect(app.registryActions.setRevoked(mine.orgId, [theirs.fileId], true)).rejects.toThrow(
      'Ни один из документов не найден',
    );

    const file = await app.prisma.file.findUniqueOrThrow({ where: { id: theirs.fileId } });
    expect(file.verifyRevoked).toBe(false);
  });

  it('страница проверки подлинности чужое показывает — она для посторонних', async () => {
    // Единственное место, где «чужой» не значит «скрытый»: код в руках
    // держит тот, кому документ и выдали. Проверка нарочно не спрашивает
    // организацию — иначе она не отвечала бы на свой единственный вопрос.
    const answer = await app.verify.check(theirs.publicId);
    expect(answer.valid).toBe(true);
  });
});
