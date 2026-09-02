import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resetDatabase, waitFor } from './support/db';
import { makeDocument, makeOrg } from './support/fixtures';
import { pdfText } from './support/pdf-text';
import { startApp, type IntegrationApp } from './support/app';

/**
 * Путь целиком: список получателей → проверка → выпуск → проверка подлинности.
 *
 * Ровно этот путь 28.08.2026 отвечал пятисотой на любом запуске, при 979
 * зелёных тестах. Ни один из них не разговаривал с базой: двойник Prisma
 * подменял тот самый метод, где жила ошибка.
 *
 * Поэтому здесь всё настоящее — база, миграции, очередь, браузер. Кроме
 * объектного хранилища: оно в памяти, и байты из него достаются такими же,
 * какими туда легли.
 */
describe('выпуск от списка получателей до проверки подлинности', () => {
  let app: IntegrationApp;
  let orgId: string;
  let documentId: string;
  let jobId: string;

  const people = [
    { name: 'Иванов Пётр Ильич', email: 'ivanov@example.ru' },
    { name: 'Соколова Мария Петровна', email: 'sokolova@example.ru' },
    { name: 'Кузнецов Дмитрий Сергеевич', email: 'kuznecov@example.ru' },
  ];

  beforeAll(async () => {
    app = await startApp({ worker: true });
    await resetDatabase(app.prisma);

    const org = await makeOrg(app.prisma, { name: 'Федерация плавания' });
    orgId = org.id;
    const document = await makeDocument(app.prisma, orgId);
    documentId = document.id;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('импорт таблицы заводит колонки и строки', async () => {
    const recipients = app.recipients;

    const result = await recipients.import(orgId, documentId, {
      mode: 'replace',
      columns: ['name', 'email'],
      rows: people.map((p) => [p.name, p.email]),
    });

    expect(result.imported).toBe(people.length);

    const table = await recipients.getTable(orgId, documentId);
    expect(table.rows).toHaveLength(people.length);
    expect(table.checkedCount).toBe(people.length);
    expect((table.rows[0].data as Record<string, string>).name).toBe(people[0].name);
  });

  it('проверка строк не находит блокирующих проблем', async () => {
    const report = await app.validation.validate(orgId, documentId, {
      scope: 'checked',
    });

    expect(report.total).toBe(people.length);
    expect(report.blocked).toBe(0);
    // Тариф оплаченный: предела нет, и выпуск упереться в него не должен.
    expect(report.quota.limit).toBeNull();
  });

  it('массовый выпуск доходит до конца и создаёт файлы', async () => {
    const started = await app.generation.start(orgId, documentId, 'pdf');
    jobId = started.job.id;
    expect(started.rowIds).toHaveLength(people.length);

    // Через ту же очередь, что и кабинет: второй очереди в системе нет.
    await app.processor.enqueue(started.job, started.rowIds);

    const job = await waitFor('задание закроется', async () => {
      const current = await app.prisma.generationJob.findUnique({ where: { id: jobId } });
      return current && current.status !== 'queued' && current.status !== 'running'
        ? current
        : null;
    });

    const failures = await app.prisma.generationRowFailure.findMany({ where: { jobId } });
    expect(failures.map((f) => f.message)).toEqual([]);
    expect(job.status).toBe('done');
    expect(job.done).toBe(people.length);

    const files = await app.prisma.file.findMany({ where: { jobId, kind: 'generated' } });
    expect(files).toHaveLength(people.length);
    // Байты дошли до хранилища, а не только запись до базы.
    for (const file of files) {
      expect(file.s3Key).not.toBe('');
      expect(app.storage.read(file.s3Key)?.length ?? 0).toBeGreaterThan(1000);
    }
  });

  it('в выпущенном PDF стоит фамилия в дательном падеже', async () => {
    const row = await app.prisma.recipientRow.findFirstOrThrow({
      where: { documentId, position: 0 },
      include: { generated: true },
    });
    const file = row.generated[0];
    const bytes = app.storage.read(file.s3Key);
    expect(bytes).toBeDefined();

    // Настоящий PDF от Chromium, а не «файл создан».
    expect(bytes!.subarray(0, 5).toString('latin1')).toBe('%PDF-');

    const text = pdfText(bytes!);
    expect(text.length).toBeGreaterThan(0);
    expect(text).toContain('Награждается');
    // Из «Иванов Пётр Ильич» на листе обязано выйти «Иванову Петру Ильичу»:
    // склонение считает сервис, и проверить его можно только заглянув
    // в готовый документ.
    expect(text).toContain('Иванову Петру Ильичу');
    expect(text).not.toContain('Иванов Пётр Ильич');
    expect(text).toContain('Первенство области по плаванию');
  });

  it('проверка подлинности находит документ по публичному коду', async () => {
    const file = await app.prisma.file.findFirstOrThrow({ where: { jobId, kind: 'generated' } });
    const answer = await app.verify.check(file.publicId);

    expect(answer.valid).toBe(true);
    expect(answer.replaced).toBe(false);
    expect(answer.title).toBe('Грамота');
    // Показываем только то, что организация сама отметила показываемым.
    expect(answer.fields).toHaveProperty('name');
    expect(answer.fields).not.toHaveProperty('email');

    const counted = await app.prisma.file.findUniqueOrThrow({ where: { id: file.id } });
    expect(counted.verifyCount).toBe(1);
  });

  it('воркер выделяет короткий код, и по нему документ тоже находится', async () => {
    const file = await app.prisma.file.findFirstOrThrow({ where: { jobId, kind: 'generated' } });
    // Тот самый вид, что напечатан на бумаге: три группы по четыре знака.
    expect(file.publicCode).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/);

    const answer = await app.verify.check(file.publicCode as string);
    expect(answer.valid).toBe(true);
    expect(answer.code).toBe(file.publicCode);
  });

  it('чужой публичный код не находится', async () => {
    await expect(app.verify.check('00000000-0000-4000-8000-00000000ffff')).rejects.toThrow(
      'Документ не найден',
    );
  });
});
