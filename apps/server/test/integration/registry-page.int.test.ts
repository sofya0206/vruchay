import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { REGISTRY_PAGE_MAX, listRegistrySchema } from '../../src/registry/registry.dto';
import { resetDatabase } from './support/db';
import { makeDocument, makeManyIssuedFiles, makeOrg } from './support/fixtures';
import { startApp, type IntegrationApp } from './support/app';

/**
 * Реестр на объёме: страница, а не выгрузка всего в память.
 *
 * За сезон у федерации накапливаются десятки тысяч выданных документов.
 * Проверка на десятке записей ничего об этом не говорит: и постраничная
 * выдача, и «прочитали всё и отрезали в браузере» на десятке ведут себя
 * одинаково. Разница видна только на настоящем объёме в настоящей базе —
 * с настоящими индексами и настоящим планом запроса.
 */
const SEASON = 4_000;
const CUP = 1_000;
const TOTAL = SEASON + CUP;
const PAGE = 50;
const CUP_EVENT = 'Кубок города';

/**
 * Сколько времени отводим странице.
 *
 * С запасом к настоящему сроку (десятки миллисекунд на машине разработчика)
 * и заведомо меньше того, во что обошлось бы чтение всех четырёх тысяч
 * записей с их достройкой. Запас нужен под конвейер: там база в соседнем
 * контейнере и машина слабее.
 */
const BUDGET_MS = 3_000;

describe('реестр отдаёт страницу на объёме в тысячи документов', () => {
  let app: IntegrationApp;
  let orgId: string;

  beforeAll(async () => {
    app = await startApp({ worker: false });
    await resetDatabase(app.prisma);

    const org = await makeOrg(app.prisma, { name: 'Федерация за сезон' });
    orgId = org.id;
    const season = await makeDocument(app.prisma, orgId, { title: 'Грамота' });
    const cup = await makeDocument(app.prisma, orgId, {
      title: 'Диплом',
      eventName: CUP_EVENT,
    });

    const created = await Promise.all([
      makeManyIssuedFiles(app.prisma, {
        orgId,
        documentId: season.id,
        count: SEASON,
        startAt: new Date(Date.UTC(2026, 0, 1)),
      }),
      makeManyIssuedFiles(app.prisma, {
        orgId,
        documentId: cup.id,
        count: CUP,
        // Своё время выпуска: реестр листает по нему, и совпадающие
        // отметки сделали бы порядок страниц неопределённым.
        startAt: new Date(Date.UTC(2026, 3, 1)),
      }),
    ]);
    expect(created).toEqual([SEASON, CUP]);
  });

  afterAll(async () => {
    await app?.close();
  });

  async function timed<T>(call: () => Promise<T>): Promise<{ result: T; ms: number }> {
    const started = Date.now();
    const result = await call();
    return { result, ms: Date.now() - started };
  }

  it('первая страница приходит целиком и быстро', async () => {
    const { result, ms } = await timed(() => app.registry.list(orgId, { limit: PAGE, offset: 0 }));

    // Полсотни строк из четырёх тысяч. Если бы выдача читала всё
    // и резала в памяти, здесь лежали бы все четыре тысячи.
    expect(result.items).toHaveLength(PAGE);
    expect(result.total).toBe(TOTAL);
    expect(result.limit).toBe(PAGE);
    expect(ms).toBeLessThan(BUDGET_MS);
  });

  it('последняя страница не медленнее первой по сути', async () => {
    const { result, ms } = await timed(() =>
      app.registry.list(orgId, { limit: PAGE, offset: TOTAL - PAGE }),
    );

    expect(result.items).toHaveLength(PAGE);
    expect(result.total).toBe(TOTAL);
    expect(ms).toBeLessThan(BUDGET_MS);
  });

  it('страницы идут подряд и не повторяются', async () => {
    const first = await app.registry.list(orgId, { limit: PAGE, offset: 0 });
    const second = await app.registry.list(orgId, { limit: PAGE, offset: PAGE });

    const ids = new Set([...first.items, ...second.items].map((i) => i.fileId));
    expect(ids.size).toBe(PAGE * 2);

    // Порядок обратный хронологическому — тот, под который есть индекс
    // (orgId, kind, createdAt).
    const times = [...first.items, ...second.items].map((i) => i.issuedAt.getTime());
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  it('запросить всё одной страницей нельзя', async () => {
    // Предел живёт в схеме запроса, а не в договорённости: иначе первый же
    // клиент, попросивший limit=100000, вернул бы нас к выгрузке целиком.
    expect(listRegistrySchema.safeParse({ limit: TOTAL, offset: 0 }).success).toBe(false);
    expect(listRegistrySchema.safeParse({ limit: REGISTRY_PAGE_MAX, offset: 0 }).success).toBe(
      true,
    );
  });

  it('отбор по мероприятию тоже приходит страницей', async () => {
    const { result, ms } = await timed(() =>
      app.registry.list(orgId, { limit: PAGE, offset: 0, event: CUP_EVENT }),
    );

    // Найденного заведомо больше страницы — и всё равно приходит страница,
    // а счёт найденного считает база.
    expect(result.total).toBe(CUP);
    expect(result.items).toHaveLength(PAGE);
    expect(ms).toBeLessThan(BUDGET_MS);
  });
});
