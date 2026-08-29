import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { resetDatabase } from './support/db';
import { makeDocument, makeOrg, makeRows } from './support/fixtures';
import { startApp, type IntegrationApp } from './support/app';

/**
 * Замок на организацию — тот самый, из-за которого 28.08.2026 не работал
 * выпуск вообще.
 *
 * `pg_advisory_xact_lock` возвращает `void`, и `$queryRaw` на нём падает
 * с P2010 «Failed to deserialize column of type 'void'». Ошибка лежала
 * на `main` с блока 9 и не была видна ни одному из 979 зелёных тестов:
 * двойник Prisma в `generation.test-utils.ts` подменял ровно тот метод,
 * в котором она жила.
 *
 * Отсюда два обещания этого файла. Первое: выпуск вообще проходит через
 * замок — верните `$queryRaw`, и здесь станет красно. Второе: замок
 * работает, то есть два одновременных выпуска в одной организации
 * не проходят оба.
 *
 * Воркер здесь не нужен и мешал бы: смотрим на задания, а не на файлы.
 */
describe('замок на организацию при выпуске', () => {
  let app: IntegrationApp;
  let orgId: string;

  beforeAll(async () => {
    // Предел пробы низкий: на нём и видно, что второй выпуск сосчитал
    // бронь первого, а не прошёл мимо неё.
    app = await startApp({ worker: false, env: { FREE_DOCUMENT_LIMIT: '4' } });
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(async () => {
    await resetDatabase(app.prisma);
    const org = await makeOrg(app.prisma, { plan: 'free' });
    orgId = org.id;
  });

  async function documentWith(rows: number, title: string) {
    const document = await makeDocument(app.prisma, orgId, { title });
    await makeRows(
      app.prisma,
      document.id,
      Array.from({ length: rows }, (_, i) => ({
        name: `Участник Номер ${i + 1}`,
        email: `p${i + 1}@example.ru`,
      })),
    );
    return document.id;
  }

  it('выпуск берёт замок и не спотыкается о pg_advisory_xact_lock', async () => {
    const documentId = await documentWith(2, 'Грамота');

    // Единственный смысл этой проверки — упасть, если замок снова начнут
    // брать через $queryRaw: тогда сюда прилетит P2010, а не задание.
    const started = await app.generation.start(orgId, documentId, 'pdf');
    expect(started.rowIds).toHaveLength(2);

    const job = await app.prisma.generationJob.findUniqueOrThrow({ where: { id: started.job.id } });
    expect(job.status).toBe('queued');
    expect(job.total).toBe(2);
  });

  it('два одновременных выпуска по одному материалу дают одно задание', async () => {
    const documentId = await documentWith(2, 'Грамота');

    const [first, second] = await Promise.allSettled([
      app.generation.start(orgId, documentId, 'pdf'),
      app.generation.start(orgId, documentId, 'pdf'),
    ]);

    const outcomes = [first.status, second.status].sort();
    expect(outcomes).toEqual(['fulfilled', 'rejected']);

    const refused = (first.status === 'rejected' ? first : second) as PromiseRejectedResult;
    expect(String(refused.reason.message)).toContain('уже идёт');

    // Без замка оба прочитали бы «активных заданий нет» и создали своё.
    const jobs = await app.prisma.generationJob.findMany({ where: { orgId } });
    expect(jobs).toHaveLength(1);
  });

  it('два одновременных выпуска по разным материалам не обходят пробу вдвоём', async () => {
    const first = await documentWith(3, 'Грамота А');
    const second = await documentWith(3, 'Грамота Б');

    const results = await Promise.allSettled([
      app.generation.start(orgId, first, 'pdf'),
      app.generation.start(orgId, second, 'pdf'),
    ]);

    const passed = results.filter((r) => r.status === 'fulfilled');
    const refused = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];

    // Проба на четыре документа, отмечено по три в каждом пакете: пройти
    // должен ровно один. Без замка оба увидели бы пустую бронь.
    expect(passed).toHaveLength(1);
    expect(refused).toHaveLength(1);
    expect(String(refused[0].reason.message)).toContain('бесплатной пробе');

    const jobs = await app.prisma.generationJob.findMany({ where: { orgId } });
    expect(jobs).toHaveLength(1);
    expect(jobs[0].total).toBe(3);
  });

  it('другая организация не ждёт чужого замка', async () => {
    const mine = await documentWith(2, 'Грамота');
    const other = await makeOrg(app.prisma, { name: 'Соседи', plan: 'free' });
    const otherDocument = await makeDocument(app.prisma, other.id, { title: 'Их грамота' });
    await makeRows(app.prisma, otherDocument.id, [{ name: 'Петров Иван', email: 'p@example.ru' }]);

    const [ours, theirs] = await Promise.all([
      app.generation.start(orgId, mine, 'pdf'),
      app.generation.start(other.id, otherDocument.id, 'pdf'),
    ]);

    // Замок берётся на организацию, а не на таблицу: чужая проба
    // и чужая очередь на нас не смотрят.
    expect(ours.job.orgId).toBe(orgId);
    expect(theirs.job.orgId).toBe(other.id);
  });
});
