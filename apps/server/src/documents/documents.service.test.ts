import { CURRENT_LAYOUT_SCHEMA_VERSION } from '@gramota/shared';
import { describe, expect, it } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { DocumentsService } from './documents.service';
import { createDocumentSchema, listDocumentsSchema } from './documents.dto';

/*
 * Проверяем то, за что отвечает сервер: скоуп организации, папку нового
 * материала и то, что копия под новое мероприятие не тащит за собой чужие
 * персональные данные.
 *
 * Prisma подменяем заглушкой: запросов нужно три — найти документ, найти
 * папку и создать новый материал. Хранилище не трогаем вовсе.
 */

const ORG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_ORG = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const DOCUMENT = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const FOLDER = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
/** Шаблон той же организации. */
const TEMPLATE = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
/** Папка соседней организации: по идентификатору она неотличима от своей. */
const OTHER_FOLDER = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

interface Created {
  data: Record<string, unknown>;
}

interface StoredDocument {
  id: string;
  orgId: string;
  title: string;
  pageWidthMm: number;
  pageHeightMm: number;
  verifyEnabled: boolean;
  verifyFields: string[];
  folderId: string | null;
  eventName: string;
  eventDate: string;
  sheets: { position: number; layout: unknown; schemaVersion: number; backgroundFileId: null }[];
  columns: { name: string; position: number }[];
  deletedAt: Date | null;
  isTemplate: boolean;
}

function stored(over: Partial<StoredDocument> = {}): StoredDocument {
  return {
    id: DOCUMENT,
    orgId: ORG,
    title: 'Грамота федерации',
    pageWidthMm: 297,
    pageHeightMm: 210,
    verifyEnabled: true,
    verifyFields: ['name'],
    folderId: FOLDER,
    eventName: 'Первенство области по плаванию',
    eventDate: '17–19 июня 2026',
    sheets: [
      { position: 0, layout: [], schemaVersion: 1, backgroundFileId: null },
    ],
    columns: [
      { name: 'name', position: 0 },
      { name: 'email', position: 1 },
      { name: 'place', position: 2 },
    ],
    deletedAt: null,
    isTemplate: false,
    ...over,
  };
}

function serviceWith(docs: StoredDocument[] = [stored()]) {
  const created: Created[] = [];
  const prisma = {
    document: {
      findFirst: async ({ where }: { where: { id: string; orgId: string; isTemplate?: boolean } }) =>
        docs.find(
          (d) =>
            d.id === where.id &&
            d.orgId === where.orgId &&
            !d.deletedAt &&
            (where.isTemplate === undefined || d.isTemplate === where.isTemplate),
        ) ?? null,
      create: async (args: Created) => {
        created.push(args);
        return { id: 'new', sheets: [] };
      },
    },
    documentFolder: {
      // Своя папка у организации одна; чужая существует, но принадлежит соседям.
      findFirst: async ({ where }: { where: { id: string; orgId: string } }) =>
        where.id === FOLDER && where.orgId === ORG ? { id: FOLDER } : null,
    },
  };
  const storage = {};
  return {
    service: new DocumentsService(prisma as never, storage as never),
    created,
  };
}

/** Что ушло в базу при создании — плоско, без обёрток Prisma. */
function payload(entry: Created) {
  const data = entry.data as {
    title: string;
    folderId: string | null;
    sourceDocumentId?: string;
    eventName?: string;
    isTemplate?: boolean;
    pageWidthMm: number;
    sheets: { create: { layout: unknown; schemaVersion: number } };
    columns: { create: { name: string }[] };
  };
  return {
    title: data.title,
    folderId: data.folderId,
    sourceDocumentId: data.sourceDocumentId,
    eventName: data.eventName,
    isTemplate: data.isTemplate ?? false,
    pageWidthMm: data.pageWidthMm,
    sheet: data.sheets.create,
    columns: data.columns.create.map((c) => c.name),
  };
}

describe('скоуп организации', () => {
  it('чужой материал не находится', async () => {
    const { service } = serviceWith();
    await expect(service.getOrFail(OTHER_ORG, DOCUMENT)).rejects.toThrow(NotFoundException);
  });

  /*
   * Именно 404, а не 403: ответ «нет доступа» подтвердил бы, что материал
   * с таким идентификатором существует, и по чужим ссылкам можно было бы
   * перебором узнать, что есть у соседней федерации.
   */
  it('копия чужого материала не снимается и отвечает 404', async () => {
    const { service, created } = serviceWith();
    await expect(service.duplicate(OTHER_ORG, DOCUMENT)).rejects.toThrow(NotFoundException);
    expect(created).toHaveLength(0);
  });

  it('удалённый материал не копируется', async () => {
    const { service } = serviceWith([stored({ deletedAt: new Date() })]);
    await expect(service.duplicate(ORG, DOCUMENT)).rejects.toThrow(NotFoundException);
  });
});

describe('создание материала', () => {
  it('лист пустой, колонок ровно две, папки нет', async () => {
    const { service, created } = serviceWith();
    const dto = createDocumentSchema.parse({ title: 'Свой бланк' });

    await service.create(ORG, dto);

    const result = payload(created[0]);
    expect(result.sheet.layout).toEqual([]);
    expect(result.sheet.schemaVersion).toBe(CURRENT_LAYOUT_SCHEMA_VERSION);
    expect(result.columns).toEqual(['name', 'email']);
    expect(result.folderId).toBeNull();
  });

  it('материал ложится в выбранную папку', async () => {
    const { service, created } = serviceWith();
    const dto = createDocumentSchema.parse({ title: 'Диплом', folderId: FOLDER });

    await service.create(ORG, dto);
    expect(payload(created[0]).folderId).toBe(FOLDER);
  });

  /*
   * Внешний ключ этого не поймает: чужая папка существует, и без проверки
   * материал уехал бы в неё по одному идентификатору из тела запроса.
   * Ответ 404, а не 403, — иначе он подтвердил бы, что папка с таким
   * идентификатором у кого-то есть.
   */
  it('в чужую папку материал не кладётся и отвечает 404', async () => {
    const { service, created } = serviceWith();
    const dto = createDocumentSchema.parse({ title: 'Диплом', folderId: OTHER_FOLDER });

    await expect(service.create(ORG, dto)).rejects.toThrow(NotFoundException);
    expect(created).toHaveLength(0);
  });

  it('в чужую папку материал не переносится и правкой', async () => {
    const { service } = serviceWith();
    await expect(service.update(ORG, DOCUMENT, { folderId: OTHER_FOLDER })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('идентификатор папки не вида UUID не проходит проверку', () => {
    expect(() => createDocumentSchema.parse({ title: 'Грамота', folderId: 'нет-такой' })).toThrow();
  });
});

describe('копия под новое мероприятие', () => {
  it('переносит макет и колонки, но не сведения о мероприятии', async () => {
    const { service, created } = serviceWith();
    await service.duplicate(ORG, DOCUMENT);

    const result = payload(created[0]);
    expect(result.columns).toEqual(['name', 'email', 'place']);
    // Мероприятие другое — иначе на новых грамотах оказалось бы старое
    // название, и заметили бы это уже после печати.
    expect(result.eventName).toBeUndefined();
    // Копия остаётся в той же папке: её делают, чтобы работать дальше там же.
    expect(result.folderId).toBe(FOLDER);
  });

  /*
   * Получатели — чужие персональные данные, и переносить их в новый
   * материал никто не просил: ч. 5 ст. 5 152-ФЗ, обработка не должна
   * выходить за рамки заявленной цели.
   */
  it('не переносит список получателей', async () => {
    const { service, created } = serviceWith();
    await service.duplicate(ORG, DOCUMENT);

    expect(JSON.stringify(created[0].data)).not.toContain('rows');
  });

  it('оставляет видимую связь с исходным материалом', async () => {
    const { service, created } = serviceWith();
    await service.duplicate(ORG, DOCUMENT);

    expect(payload(created[0]).sourceDocumentId).toBe(DOCUMENT);
    expect(payload(created[0]).title).toBe('Грамота федерации — новое мероприятие');
  });
});

describe('шаблоны', () => {
  const template = () =>
    stored({ id: TEMPLATE, title: 'Бланк федерации', isTemplate: true, pageWidthMm: 210 });

  it('документ по шаблону берёт макет, колонки и размер листа, но не мероприятие', async () => {
    const { service, created } = serviceWith([template()]);
    const dto = createDocumentSchema.parse({ title: 'Кубок города', templateId: TEMPLATE });

    await service.create(ORG, dto);

    const result = payload(created[0]);
    expect(result.title).toBe('Кубок города');
    expect(result.isTemplate).toBe(false);
    expect(result.columns).toEqual(['name', 'email', 'place']);
    // Макет свёрстан под лист шаблона: размер по умолчанию его бы сломал.
    expect(result.pageWidthMm).toBe(210);
    expect(result.eventName).toBeUndefined();
    expect(result.sourceDocumentId).toBe(TEMPLATE);
    expect(JSON.stringify(created[0].data)).not.toContain('rows');
  });

  it('обычный документ за шаблон не принимается', async () => {
    const { service, created } = serviceWith();
    const dto = createDocumentSchema.parse({ title: 'Кубок', templateId: DOCUMENT });

    await expect(service.create(ORG, dto)).rejects.toThrow(NotFoundException);
    expect(created).toHaveLength(0);
  });

  it('чужой шаблон не находится и отвечает 404', async () => {
    const { service, created } = serviceWith([template()]);
    const dto = createDocumentSchema.parse({ title: 'Кубок', templateId: TEMPLATE });

    await expect(service.create(OTHER_ORG, dto)).rejects.toThrow(NotFoundException);
    expect(created).toHaveLength(0);
  });

  it('сохранение как шаблон — копия без получателей и вне папки', async () => {
    const { service, created } = serviceWith();
    await service.saveAsTemplate(ORG, DOCUMENT);

    const result = payload(created[0]);
    expect(result.isTemplate).toBe(true);
    expect(result.title).toBe('Грамота федерации');
    expect(result.folderId).toBeNull();
    expect(result.eventName).toBeUndefined();
    expect(JSON.stringify(created[0].data)).not.toContain('rows');
  });

  it('копия шаблона остаётся шаблоном', async () => {
    const { service, created } = serviceWith([template()]);
    await service.duplicate(ORG, TEMPLATE);

    expect(payload(created[0]).isTemplate).toBe(true);
    expect(payload(created[0]).title).toBe('Бланк федерации — копия');
  });

  it('в списке документов шаблонов нет, пока их не попросили', () => {
    expect(listDocumentsSchema.parse({}).templates).toBe(false);
    expect(listDocumentsSchema.parse({ templates: 'true' }).templates).toBe(true);
  });
});

describe('фильтры библиотеки', () => {
  it('по умолчанию — свежие сверху и не корзина', () => {
    const query = listDocumentsSchema.parse({});
    expect(query.sort).toBe('updated');
    expect(query.trashed).toBe(false);
    expect(query.folderId).toBeUndefined();
  });

  it('папка и порядок принимаются только в известном виде', () => {
    expect(listDocumentsSchema.parse({ folderId: FOLDER }).folderId).toBe(FOLDER);
    expect(() => listDocumentsSchema.parse({ folderId: 'нет-такой' })).toThrow();
    expect(() => listDocumentsSchema.parse({ sort: 'random' })).toThrow();
  });
});
