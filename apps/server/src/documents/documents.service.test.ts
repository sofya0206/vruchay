import { CURRENT_LAYOUT_SCHEMA_VERSION } from '@gramota/shared';
import { describe, expect, it } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { extractVariables } from '@gramota/shared';
import { DocumentsService } from './documents.service';
import { createDocumentSchema, listDocumentsSchema } from './documents.dto';

/*
 * Проверяем то, за что отвечает сервер: скоуп организации, раскладку
 * заготовки на новом материале и то, что копия под новое мероприятие
 * не тащит за собой чужие персональные данные. Саму геометрию заготовок
 * проверяют тесты в @gramota/shared — дублировать их здесь незачем.
 *
 * Prisma подменяем заглушкой: запросов нужно ровно два — найти документ
 * и создать новый. Хранилище не трогаем вовсе.
 */

const ORG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_ORG = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const DOCUMENT = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

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
  category: string | null;
  eventName: string;
  eventDate: string;
  sheets: { position: number; layout: unknown; schemaVersion: number; backgroundFileId: null }[];
  columns: { name: string; position: number }[];
  deletedAt: Date | null;
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
    category: 'sport',
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
    ...over,
  };
}

function serviceWith(docs: StoredDocument[] = [stored()]) {
  const created: Created[] = [];
  const prisma = {
    document: {
      findFirst: async ({ where }: { where: { id: string; orgId: string } }) =>
        docs.find((d) => d.id === where.id && d.orgId === where.orgId && !d.deletedAt) ?? null,
      create: async (args: Created) => {
        created.push(args);
        return { id: 'new', sheets: [] };
      },
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
    category: string | null;
    sourceDocumentId?: string;
    eventName?: string;
    sheets: { create: { layout: unknown; schemaVersion: number } };
    columns: { create: { name: string }[] };
  };
  return {
    title: data.title,
    category: data.category,
    sourceDocumentId: data.sourceDocumentId,
    eventName: data.eventName,
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

describe('создание из заготовки', () => {
  it('материал получает расставленный макет и колонки заготовки', async () => {
    const { service, created } = serviceWith();
    const dto = createDocumentSchema.parse({
      title: 'Грамота за место',
      presetId: 'sport-award',
    });

    await service.create(ORG, dto);

    const result = payload(created[0]);
    const layout = result.sheet.layout as { type: string }[];
    expect(layout.length).toBeGreaterThan(0);
    expect(result.sheet.schemaVersion).toBe(CURRENT_LAYOUT_SCHEMA_VERSION);
    // Заготовке нужна колонка «place», иначе «за %place_word место»
    // напечатается как «за  место».
    expect(result.columns).toContain('place');
    // Раздел берётся из заготовки, если человек не выбрал свой.
    expect(result.category).toBe('sport');
  });

  it('в макете заготовки нет переменных, которых сервис не знает', async () => {
    const { service, created } = serviceWith();
    const dto = createDocumentSchema.parse({
      title: 'Сертификат',
      presetId: 'course-certificate',
    });

    await service.create(ORG, dto);

    const layout = payload(created[0]).sheet.layout as Parameters<typeof extractVariables>[0];
    const known = new Set(['name', 'email', 'event', 'event_date', 'event_place', 'hours', 'org', 'date']);
    for (const name of extractVariables(layout)) {
      expect(known.has(name), `неизвестная переменная %${name}`).toBe(true);
    }
  });

  it('без заготовки лист пустой, а колонок ровно две', async () => {
    const { service, created } = serviceWith();
    const dto = createDocumentSchema.parse({ title: 'Свой бланк' });

    await service.create(ORG, dto);

    const result = payload(created[0]);
    expect(result.sheet.layout).toEqual([]);
    expect(result.columns).toEqual(['name', 'email']);
    expect(result.category).toBeNull();
  });

  it('выбранный человеком раздел сильнее раздела заготовки', async () => {
    const { service, created } = serviceWith();
    const dto = createDocumentSchema.parse({
      title: 'Диплом',
      presetId: 'sport-award',
      category: 'contest',
    });

    await service.create(ORG, dto);
    expect(payload(created[0]).category).toBe('contest');
  });

  it('выдуманная заготовка и выдуманный раздел не проходят проверку', () => {
    expect(() =>
      createDocumentSchema.parse({ title: 'Грамота', presetId: 'нет-такой' }),
    ).toThrow();
    expect(() =>
      createDocumentSchema.parse({ title: 'Грамота', category: 'нет-такого' }),
    ).toThrow();
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
    expect(result.category).toBe('sport');
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

describe('фильтры библиотеки', () => {
  it('по умолчанию — свежие сверху и не корзина', () => {
    const query = listDocumentsSchema.parse({});
    expect(query.sort).toBe('updated');
    expect(query.trashed).toBe(false);
    expect(query.category).toBeUndefined();
  });

  it('раздел и порядок принимаются только из известного списка', () => {
    expect(listDocumentsSchema.parse({ category: 'education' }).category).toBe('education');
    expect(() => listDocumentsSchema.parse({ category: 'нет-такого' })).toThrow();
    expect(() => listDocumentsSchema.parse({ sort: 'random' })).toThrow();
  });
});
