import { describe, expect, it } from 'vitest';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { FoldersService } from './folders.service';

/*
 * Проверяем то, за что отвечает сервер: скоуп организации, занятое имя
 * и перестановку. Отдельно — что удаление папки не уносит с собой материалы:
 * это главное обещание раздела, и цена ошибки равна сезону работы.
 *
 * Prisma подменяем заглушкой поверх обычного массива. Связь «папка —
 * материалы» в ней живёт полем `folderId` у материала, как в базе, поэтому
 * `onDelete: SetNull` приходится повторять руками: заглушка не знает про
 * внешние ключи. Настоящее поведение базы проверяется не здесь, а слоем
 * `test:integration`, где схема накатывается миграциями.
 */

const ORG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_ORG = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const SPORT = '11111111-1111-4111-8111-111111111111';
const STUDY = '22222222-2222-4222-8222-222222222222';
const PASSES = '33333333-3333-4333-8333-333333333333';
/** Папка соседней организации: по идентификатору она неотличима от своей. */
const ALIEN = '99999999-9999-4999-8999-999999999999';

interface StoredFolder {
  id: string;
  orgId: string;
  name: string;
  position: number;
  createdAt: Date;
}

interface StoredDocument {
  id: string;
  orgId: string;
  folderId: string | null;
  deletedAt: Date | null;
}

function defaultFolders(): StoredFolder[] {
  return [
    { id: SPORT, orgId: ORG, name: 'Спортивные соревнования', position: 0, createdAt: new Date(1) },
    { id: STUDY, orgId: ORG, name: 'Обучение и семинары', position: 1, createdAt: new Date(2) },
    { id: PASSES, orgId: ORG, name: 'Пропуска', position: 2, createdAt: new Date(3) },
    { id: ALIEN, orgId: OTHER_ORG, name: 'Чужая папка', position: 0, createdAt: new Date(4) },
  ];
}

function defaultDocuments(): StoredDocument[] {
  return [
    { id: 'd1', orgId: ORG, folderId: SPORT, deletedAt: null },
    { id: 'd2', orgId: ORG, folderId: SPORT, deletedAt: null },
    // В корзине: из папки он уже ушёл и в счётчике ему не место.
    { id: 'd3', orgId: ORG, folderId: SPORT, deletedAt: new Date() },
    { id: 'd4', orgId: ORG, folderId: STUDY, deletedAt: null },
  ];
}

function serviceWith(
  folders: StoredFolder[] = defaultFolders(),
  documents: StoredDocument[] = defaultDocuments(),
) {
  const mine = (orgId: string) => folders.filter((f) => f.orgId === orgId);

  const prisma = {
    documentFolder: {
      findMany: async ({ where }: { where: { orgId: string } }) => {
        const rows = mine(where.orgId).sort(
          (a, b) => a.position - b.position || a.createdAt.getTime() - b.createdAt.getTime(),
        );
        return rows.map((f) => ({
          ...f,
          _count: {
            documents: documents.filter((d) => d.folderId === f.id && !d.deletedAt).length,
          },
        }));
      },
      findFirst: async ({
        where,
        orderBy,
      }: {
        where: { id?: string; orgId: string };
        orderBy?: { position: 'desc' };
      }) => {
        // Без `id` это запрос «последняя папка организации» — для новой позиции.
        if (!where.id) {
          const rows = mine(where.orgId);
          if (!rows.length) return null;
          return orderBy ? rows.reduce((a, b) => (b.position > a.position ? b : a)) : rows[0];
        }
        return folders.find((f) => f.id === where.id && f.orgId === where.orgId) ?? null;
      },
      create: async ({ data }: { data: Omit<StoredFolder, 'createdAt'> }) => {
        if (folders.some((f) => f.orgId === data.orgId && f.name === data.name)) {
          throw new Prisma.PrismaClientKnownRequestError('нарушение уникальности', {
            code: 'P2002',
            clientVersion: 'test',
          });
        }
        const row = { ...data, createdAt: new Date() };
        folders.push(row);
        return row;
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<Pick<StoredFolder, 'name' | 'position'>>;
      }) => {
        const row = folders.find((f) => f.id === where.id)!;
        if (data.name !== undefined) {
          const taken = folders.some(
            (f) => f.orgId === row.orgId && f.name === data.name && f.id !== row.id,
          );
          if (taken) {
            throw new Prisma.PrismaClientKnownRequestError('нарушение уникальности', {
              code: 'P2002',
              clientVersion: 'test',
            });
          }
        }
        Object.assign(row, data);
        return row;
      },
      delete: async ({ where }: { where: { id: string } }) => {
        const at = folders.findIndex((f) => f.id === where.id);
        const [row] = folders.splice(at, 1);
        // Повторяем `onDelete: SetNull`, который в бою делает сама база.
        for (const d of documents) if (d.folderId === row.id) d.folderId = null;
        return row;
      },
    },
    // Настоящая транзакция здесь не нужна: важно, что все обновления
    // отправлены одним списком, а не по одному запросу на папку.
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
  };

  return { service: new FoldersService(prisma as never), folders, documents };
}

describe('скоуп организации', () => {
  it('чужая папка не переименовывается и отвечает 404', async () => {
    const { service, folders } = serviceWith();
    await expect(service.rename(ORG, ALIEN, 'Моя теперь')).rejects.toThrow(NotFoundException);
    expect(folders.find((f) => f.id === ALIEN)!.name).toBe('Чужая папка');
  });

  /*
   * Именно 404, а не 403: ответ «нет доступа» подтвердил бы, что папка
   * с таким идентификатором у кого-то есть, и перебором можно было бы
   * узнать состав чужой библиотеки.
   */
  it('чужая папка не удаляется и отвечает 404', async () => {
    const { service, folders } = serviceWith();
    await expect(service.remove(ORG, ALIEN)).rejects.toThrow(NotFoundException);
    expect(folders.some((f) => f.id === ALIEN)).toBe(true);
  });

  it('в списке только свои папки', async () => {
    const { service } = serviceWith();
    const list = await service.list(ORG);
    expect(list.map((f) => f.id)).toEqual([SPORT, STUDY, PASSES]);
  });
});

describe('удаление папки', () => {
  /*
   * Главное обещание раздела: папку заводят на глаз и удаляют так же легко.
   * Если бы вместе с ней уходили материалы, одно случайное нажатие стоило бы
   * сезона работы.
   */
  it('не удаляет материалы, а возвращает их в корень', async () => {
    const { service, documents } = serviceWith();
    await service.remove(ORG, SPORT);

    const was = documents.filter((d) => d.id === 'd1' || d.id === 'd2' || d.id === 'd3');
    expect(was).toHaveLength(3);
    expect(was.every((d) => d.folderId === null)).toBe(true);
    // Материал чужой папки не тронут.
    expect(documents.find((d) => d.id === 'd4')!.folderId).toBe(STUDY);
  });
});

describe('имя папки', () => {
  it('занятое имя — это 409, а не сбой', async () => {
    const { service } = serviceWith();
    await expect(service.create(ORG, 'Пропуска')).rejects.toThrow(ConflictException);
  });

  it('то же имя у соседней организации не мешает', async () => {
    const { service } = serviceWith();
    await expect(service.create(OTHER_ORG, 'Пропуска')).resolves.toMatchObject({
      name: 'Пропуска',
    });
  });

  it('переименование в занятое имя — 409', async () => {
    const { service } = serviceWith();
    await expect(service.rename(ORG, SPORT, 'Пропуска')).rejects.toThrow(ConflictException);
  });

  it('новая папка встаёт в конец списка', async () => {
    const { service } = serviceWith();
    const created = await service.create(ORG, 'Корпоративные благодарности');
    expect(created.position).toBe(3);
  });
});

describe('счётчик материалов', () => {
  it('считает только живые: то, что в корзине, из папки ушло', async () => {
    const { service } = serviceWith();
    const list = await service.list(ORG);
    expect(list.find((f) => f.id === SPORT)!.count).toBe(2);
    expect(list.find((f) => f.id === PASSES)!.count).toBe(0);
  });
});

describe('перестановка папок', () => {
  it('раскладывает позиции по номеру в списке', async () => {
    const { service } = serviceWith();
    const list = await service.reorder(ORG, [PASSES, SPORT, STUDY]);
    expect(list.map((f) => f.id)).toEqual([PASSES, SPORT, STUDY]);
    expect(list.map((f) => f.position)).toEqual([0, 1, 2]);
  });

  /*
   * Неполный список — не «переставим что прислали»: остальные папки
   * остались бы на позициях, которые человек не выбирал, и колонка
   * перемешалась бы у него на глазах.
   */
  it('неполный список отвергается, порядок не меняется', async () => {
    const { service } = serviceWith();
    await expect(service.reorder(ORG, [PASSES, SPORT])).rejects.toThrow(NotFoundException);
    const list = await service.list(ORG);
    expect(list.map((f) => f.id)).toEqual([SPORT, STUDY, PASSES]);
  });

  it('чужая папка в списке — 404, и своих это не двигает', async () => {
    const { service } = serviceWith();
    await expect(service.reorder(ORG, [SPORT, STUDY, ALIEN])).rejects.toThrow(NotFoundException);
    const list = await service.list(ORG);
    expect(list.map((f) => f.id)).toEqual([SPORT, STUDY, PASSES]);
  });

  it('повтор в списке отвергается', async () => {
    const { service } = serviceWith();
    await expect(service.reorder(ORG, [SPORT, SPORT, STUDY])).rejects.toThrow(BadRequestException);
  });
});
