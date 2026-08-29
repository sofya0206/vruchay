import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fileState } from '../../src/registry/file-state';
import { resetDatabase, waitFor } from './support/db';
import { makeDocument, makeOrg, makeRows } from './support/fixtures';
import { startApp, type IntegrationApp } from './support/app';

/**
 * Перевыпуск: старый документ становится заменённым, новый встаёт на его
 * место, страница проверки старого честно говорит о замене.
 *
 * Связь «старый → новый» нигде не записана прямо в момент нажатия: сначала
 * ставится обещание (`replacedByJobId`), и только появившийся файл
 * превращает его в ссылку (`replacedById`). Всё это — пара (job_id, row_id)
 * и выборки по ней; на двойнике проверяется только то, что двойник
 * запрограммировали вернуть.
 *
 * Отзыв — отдельное состояние, а не разновидность замены: отозванный
 * документ страница проверки не показывает вовсе.
 */
describe('перевыпуск и отзыв', () => {
  let app: IntegrationApp;
  let orgId: string;
  let documentId: string;
  let oldFile: { id: string; publicId: string; rowId: string | null };
  let newFile: { id: string; publicId: string };

  beforeAll(async () => {
    app = await startApp({ worker: true });
    await resetDatabase(app.prisma);

    const org = await makeOrg(app.prisma, { name: 'Федерация' });
    orgId = org.id;
    const document = await makeDocument(app.prisma, orgId);
    documentId = document.id;
    await makeRows(app.prisma, documentId, [
      { name: 'Иванов Пётр Ильич', email: 'ivanov@example.ru' },
      { name: 'Соколова Мария Петровна', email: 'sokolova@example.ru' },
    ]);

    const started = await app.generation.start(orgId, documentId, 'pdf');
    await app.processor.enqueue(started.job, started.rowIds);
    await waitFor('первый выпуск закончится', async () => {
      const job = await app.prisma.generationJob.findUnique({ where: { id: started.job.id } });
      return job?.status === 'done' ? job : null;
    });

    oldFile = await app.prisma.file.findFirstOrThrow({
      where: { jobId: started.job.id, kind: 'generated' },
      orderBy: { createdAt: 'asc' },
      select: { id: true, publicId: true, rowId: true },
    });
  });

  afterAll(async () => {
    await app?.close();
  });

  it('обещание перевыпуска не гасит действующий документ', async () => {
    // Упавший перевыпуск: задание есть, файла нет. Пока замены нет,
    // старый документ действителен — иначе человек остался бы вообще
    // без документа из-за нашей неудачи.
    const failed = await app.prisma.generationJob.create({
      data: { orgId, documentId, format: 'pdf', total: 1, status: 'failed' },
    });
    await app.prisma.file.update({
      where: { id: oldFile.id },
      data: { replacedByJobId: failed.id },
    });

    const answer = await app.verify.check(oldFile.publicId);
    expect(answer.valid).toBe(true);
    expect(answer.replaced).toBe(false);

    // Обещание при этом снято: иначе документ навсегда остался бы
    // «перевыпускается», хотя перевыпускать давно перестали.
    const settled = await app.prisma.file.findUniqueOrThrow({ where: { id: oldFile.id } });
    expect(settled.replacedByJobId).toBeNull();
    expect(settled.replacedById).toBeNull();
  });

  it('перевыпуск создаёт новый документ и связывает его со старым', async () => {
    const result = await app.registryActions.reissue(orgId, [oldFile.id]);

    expect(result.reissued).toBe(1);
    expect(result.skipped).toEqual([]);
    expect(result.jobs).toHaveLength(1);

    newFile = await waitFor('новый документ появится', async () =>
      app.prisma.file.findFirst({
        where: { jobId: result.jobs[0].jobId, rowId: oldFile.rowId, kind: 'generated' },
        select: { id: true, publicId: true },
      }),
    );

    expect(newFile.id).not.toBe(oldFile.id);
    // Байты у нового свои: это настоящий второй выпуск, а не пометка.
    const stored = await app.prisma.file.findUniqueOrThrow({ where: { id: newFile.id } });
    expect(app.storage.read(stored.s3Key)?.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it('страница проверки старого документа отправляет за новым', async () => {
    const answer = await app.verify.check(oldFile.publicId);

    expect(answer.valid).toBe(false);
    expect(answer.replaced).toBe(true);
    expect(answer.replacedBy?.publicId).toBe(newFile.publicId);
    // Тому, кто держит старую бумагу, отказывать не за что: перевыпуск —
    // это исправленная опечатка, а не проступок.
    expect(answer.fields).toHaveProperty('name');

    const replacement = await app.verify.check(newFile.publicId);
    expect(replacement.valid).toBe(true);
    expect(replacement.replaced).toBe(false);
  });

  it('реестр показывает «заменён» у старого и «действителен» у нового', async () => {
    const files = await app.prisma.file.findMany({
      where: { id: { in: [oldFile.id, newFile.id] } },
      select: { id: true, verifyRevoked: true, replacedById: true },
    });
    const state = new Map(files.map((f) => [f.id, fileState(f)]));

    expect(state.get(oldFile.id)).toBe('replaced');
    expect(state.get(newFile.id)).toBe('valid');
  });

  it('заменённый документ второй раз не перевыпускают', async () => {
    const result = await app.registryActions.reissue(orgId, [oldFile.id]);

    expect(result.reissued).toBe(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toContain('уже заменён');
  });

  it('отзыв — отдельное состояние: документа больше нет вовсе', async () => {
    await app.registryActions.setRevoked(orgId, [newFile.id], true);

    await expect(app.verify.check(newFile.publicId)).rejects.toThrow('Документ не найден');

    // Старый по-прежнему заменён, но вести человека на отозванную замену
    // нельзя: он получил бы «не найдено» и пошёл разбираться сам.
    const answer = await app.verify.check(oldFile.publicId);
    expect(answer.replaced).toBe(true);
    expect(answer.replacedBy).toBeNull();

    const revoked = await app.prisma.file.findUniqueOrThrow({ where: { id: newFile.id } });
    expect(fileState(revoked)).toBe('revoked');
    // Сам файл остался: его могли скачать и распечатать.
    expect(revoked.deletedAt).toBeNull();
    expect(revoked.s3Key).not.toBe('');
  });

  it('отзыв снимается и документ снова проверяется', async () => {
    await app.registryActions.setRevoked(orgId, [newFile.id], false);

    const answer = await app.verify.check(newFile.publicId);
    expect(answer.valid).toBe(true);
  });
});
