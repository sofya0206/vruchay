import { NotFoundException } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PublicOrgService } from '../../src/public-org/public-org.service';
import { resetDatabase } from './support/db';
import { makeDocument, makeIssuedFile, makeOrg, makeRows } from './support/fixtures';
import { startApp, type IntegrationApp } from './support/app';

/**
 * Публичный реестр эмитента на настоящей базе: без входа, только
 * по решению организации, поиск по ФИО выключен по умолчанию.
 */
describe('публичная страница организации', () => {
  let app: IntegrationApp;
  let service: PublicOrgService;
  let orgId = '';
  let code = '';

  beforeAll(async () => {
    app = await startApp({ worker: false });
    await resetDatabase(app.prisma);
    service = new PublicOrgService(app.prisma, app.storage as never);

    const org = await makeOrg(app.prisma, { name: 'Федерация плавания' });
    orgId = org.id;
    const document = await makeDocument(app.prisma, orgId, {
      title: 'Диплом',
      verifyFields: ['name'],
    });
    const [row] = await makeRows(app.prisma, document.id, [
      { name: 'Иванов Пётр Ильич', email: 'ivanov@example.ru' },
    ]);
    const file = await makeIssuedFile(app.prisma, {
      orgId,
      documentId: document.id,
      rowId: row.id,
    });
    code = 'K7M2-9QXR-4TVB';
    await app.prisma.file.update({
      where: { id: file.id },
      data: { publicCode: code, issuedData: { name: 'Иванов Пётр Ильич' } },
    });
  });

  afterAll(async () => {
    await app?.close();
  });

  it('пока организация не включила страницу — её нет', async () => {
    await app.prisma.organization.update({ where: { id: orgId }, data: { slug: 'federation' } });
    await expect(service.page('federation')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('включённая страница открывается без входа и перечисляет программы', async () => {
    await app.prisma.organization.update({
      where: { id: orgId },
      data: { publicPageEnabled: true, inn: '7700000000', description: 'Региональная федерация' },
    });

    const page = await service.page('federation');
    expect(page.name).toBe('Федерация плавания');
    expect(page.inn).toBe('7700000000');
    expect(page.verified).toBe(false);
    expect(page.indexable).toBe(false);
    expect(page.searchByName).toBe(false);
    expect(page.programs).toHaveLength(1);
    expect(page.programs[0]).toMatchObject({ title: 'Диплом', issued: 1 });
  });

  it('поиск по номеру ведёт на страницу проверки', async () => {
    expect(await service.findByCode('federation', code.toLowerCase())).toEqual({
      path: `/c/${code}`,
    });
    await expect(service.findByCode('federation', 'AAAA-BBBB-CCCC')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('поиск по ФИО выключен по умолчанию, а включённый ищет по снимку выпуска', async () => {
    await expect(service.searchByName('federation', 'Иванов')).rejects.toBeInstanceOf(
      NotFoundException,
    );

    await app.prisma.organization.update({
      where: { id: orgId },
      data: { publicSearchByName: true, verifyNameMode: 'initials' },
    });
    const { items } = await service.searchByName('federation', 'иванов');
    expect(items).toHaveLength(1);
    expect(items[0].path).toBe(`/c/${code}`);
    expect(items[0].name.replace(/\u00a0/g, ' ')).toBe('Иванов П. И.');
  });

  it('значок эмитента ставит только сервис, и страница его показывает', async () => {
    await app.prisma.organization.update({
      where: { id: orgId },
      data: { verifiedIssuer: true, verifiedAt: new Date() },
    });
    const page = await service.page('federation');
    expect(page.verified).toBe(true);
    expect(page.verifiedAt).not.toBeNull();
  });
});
