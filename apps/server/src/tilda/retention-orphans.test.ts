import { describe, expect, it } from 'vitest';
import { RetentionService } from './retention.service';
import { testConfig } from '../config/env.test-utils';

/*
 * Сверка хранилища с таблицей файлов.
 *
 * В комментарии к `storage.remove` было написано, что осиротевшие объекты
 * подчистит фоновая задача cleanup. Такой задачи не существовало: байты,
 * записанные в S3 до того, как в базе появилась строка `File`, не удалял
 * никто и никогда — их ключ знала только та строка, которой не появилось.
 *
 * Проверяем ровно две вещи, в которых можно ошибиться дорого: что удаляется
 * то, на что никто не ссылается, и что НЕ удаляется всё остальное. Вторая
 * важнее: ошибка здесь стирает выданные документы.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const ago = (days: number) => new Date(Date.now() - days * DAY_MS);

function serviceWith(
  objects: { key: string; lastModified: Date }[],
  knownKeys: string[],
  options: { failListing?: boolean } = {},
) {
  const removed: string[] = [];
  const listed: (string | undefined)[] = [];
  const lookups: string[][] = [];

  const prisma = {
    tildaRequest: {
      updateMany: async () => ({ count: 0 }),
      deleteMany: async () => ({ count: 0 }),
    },
    consent: { deleteMany: async () => ({ count: 0 }) },
    email: { updateMany: async () => ({ count: 0 }) },
    file: {
      findMany: async ({ where }: { where: { s3Key: { in: string[] } } }) => {
        lookups.push(where.s3Key.in);
        return where.s3Key.in
          .filter((key) => knownKeys.includes(key))
          .map((s3Key) => ({ s3Key }));
      },
    },
  };
  const documents = { purgeExpired: async () => 0 };
  const storage = {
    listObjects: async function* (prefix: string) {
      listed.push(prefix);
      if (options.failListing) throw new Error('хранилище недоступно');
      yield* objects;
    },
    remove: async (key: string) => {
      removed.push(key);
    },
  };

  return {
    service: new RetentionService(
      prisma as never,
      testConfig() as never,
      documents as never,
      storage as never,
    ),
    removed,
    listed,
    lookups,
  };
}

describe('уборка брошенных объектов хранилища', () => {
  it('удаляет объект, на который не ссылается ни одна запись', async () => {
    const { service, removed } = serviceWith(
      [{ key: 'org/o1/doc/d1/gen/j1/brosheny.pdf', lastModified: ago(30) }],
      [],
    );

    const result = await service.run();

    expect(removed).toEqual(['org/o1/doc/d1/gen/j1/brosheny.pdf']);
    expect(result.orphans).toBe(1);
  });

  it('объект с записью в базе не трогает', async () => {
    // Здесь ошибка стоит дороже всего: это выданный участнику документ.
    const { service, removed, lookups } = serviceWith(
      [{ key: 'org/o1/doc/d1/gen/j1/vydan.pdf', lastModified: ago(400) }],
      ['org/o1/doc/d1/gen/j1/vydan.pdf'],
    );

    const result = await service.run();

    expect(removed).toEqual([]);
    expect(result.orphans).toBe(0);
    // Ключ всё-таки проверялся, а не был пропущен по дороге.
    expect(lookups).toEqual([['org/o1/doc/d1/gen/j1/vydan.pdf']]);
  });

  it('свежий объект не трогает: он может быть половиной идущей загрузки', async () => {
    const { service, removed, lookups } = serviceWith(
      [{ key: 'org/o1/doc/d1/bg/pryamo-seychas.png', lastModified: ago(0) }],
      [],
    );

    const result = await service.run();

    expect(removed).toEqual([]);
    expect(result.orphans).toBe(0);
    // Молодой объект отсеивается до запроса в базу.
    expect(lookups).toEqual([]);
  });

  it('смотрит только файлы приложения, не копии базы', async () => {
    // Бакет копий задаётся переменной окружения. Укажут тот же — записи
    // в `File` у копий нет и быть не может, и сверка приняла бы их за мусор.
    const { service, listed } = serviceWith([], []);
    await service.run();
    expect(listed).toEqual(['org/']);
  });

  it('недоступное хранилище не отменяет работу по срокам хранения', async () => {
    // Сроки хранения выполняются в базе и отвечают перед законом,
    // а брошенные байты подождут до следующей ночи.
    const { service, removed } = serviceWith([], [], { failListing: true });

    const result = await service.run();

    expect(result.orphans).toBe(0);
    expect(removed).toEqual([]);
  });
});
