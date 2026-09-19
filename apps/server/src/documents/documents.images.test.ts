import { describe, expect, it } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { sheetLayout, type SheetLayout } from '@gramota/shared';
import { DocumentsService } from './documents.service';

/*
 * Картинка на листе — это `fileId` в макете, а макет приходит с клиента.
 * Проверяем то, без чего чужой файл попал бы на свой лист: сохранение
 * пускает только файлы своей организации, и загрузка — только в свой
 * материал.
 */

const ORG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_ORG = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const DOCUMENT = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const SHEET = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const OWN_FILE = '11111111-1111-4111-8111-111111111111';
const FOREIGN_FILE = '22222222-2222-4222-8222-222222222222';
const GONE_FILE = '33333333-3333-4333-8333-333333333333';

interface StoredFile {
  id: string;
  orgId: string;
  kind: 'asset' | 'background' | 'generated';
  deletedAt: Date | null;
}

const FILES: StoredFile[] = [
  { id: OWN_FILE, orgId: ORG, kind: 'asset', deletedAt: null },
  { id: FOREIGN_FILE, orgId: OTHER_ORG, kind: 'asset', deletedAt: null },
];

function image(fileId: string, id = `img-${fileId.slice(0, 4)}`) {
  return { id, type: 'image', x: 10, y: 10, w: 40, h: 30, props: { fileId } };
}

function layoutOf(...elements: unknown[]): SheetLayout {
  return sheetLayout.parse(elements);
}

function serviceWith(storedLayout: unknown[] = []) {
  const saved: unknown[] = [];
  const fileQueries: unknown[] = [];
  const prisma = {
    sheet: {
      findFirst: async () => ({ id: SHEET, documentId: DOCUMENT, layout: storedLayout }),
      update: async ({ data }: { data: { layout: unknown } }) => {
        saved.push(data.layout);
        return { id: SHEET };
      },
    },
    file: {
      count: async ({ where }: { where: { id: { in: string[] }; orgId: string; kind: string } }) => {
        fileQueries.push(where);
        return FILES.filter(
          (f) => where.id.in.includes(f.id) && f.orgId === where.orgId && f.kind === where.kind && !f.deletedAt,
        ).length;
      },
    },
  };
  const service = new DocumentsService(prisma as never, {} as never);
  return { service, saved, fileQueries };
}

describe('картинки в макете', () => {
  it('своя картинка сохраняется', async () => {
    const { service, saved } = serviceWith();
    await service.updateSheetLayout(ORG, DOCUMENT, SHEET, layoutOf(image(OWN_FILE)));
    expect(saved).toHaveLength(1);
  });

  it('картинка соседней организации не сохраняется и отвечает 404', async () => {
    const { service, saved } = serviceWith();
    await expect(
      service.updateSheetLayout(ORG, DOCUMENT, SHEET, layoutOf(image(FOREIGN_FILE))),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(saved).toHaveLength(0);
  });

  it('выдуманный идентификатор тоже не проходит', async () => {
    const { service } = serviceWith();
    await expect(
      service.updateSheetLayout(ORG, DOCUMENT, SHEET, layoutOf(image(GONE_FILE))),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('уже сохранённая картинка не мешает правке, даже если файла нет', async () => {
    // Копия материала ссылается на файл исходника — тот мог уйти вместе
    // с исходником. Сохранение из-за этого вставать не должно.
    const { service, saved, fileQueries } = serviceWith([image(GONE_FILE, 'old')]);
    await service.updateSheetLayout(ORG, DOCUMENT, SHEET, layoutOf({ ...image(GONE_FILE, 'old'), x: 20 }));
    expect(saved).toHaveLength(1);
    expect(fileQueries).toHaveLength(0);
  });

  it('проверяются только новые картинки', async () => {
    const { service, fileQueries } = serviceWith([image(GONE_FILE, 'old')]);
    await service.updateSheetLayout(
      ORG,
      DOCUMENT,
      SHEET,
      layoutOf(image(GONE_FILE, 'old'), image(OWN_FILE, 'new')),
    );
    expect(fileQueries).toEqual([
      expect.objectContaining({ id: { in: [OWN_FILE] }, orgId: ORG, kind: 'asset' }),
    ]);
  });

  it('макет без картинок в файлы не заглядывает', async () => {
    const { service, fileQueries } = serviceWith();
    await service.updateSheetLayout(ORG, DOCUMENT, SHEET, layoutOf());
    expect(fileQueries).toHaveLength(0);
  });
});

describe('загрузка картинки', () => {
  const png = { mime: 'image/png', ext: 'png' } as const;

  function uploadService(docOrg: string) {
    const put: string[] = [];
    const prisma = {
      document: {
        findFirst: async ({ where }: { where: { id: string; orgId: string } }) =>
          where.id === DOCUMENT && where.orgId === docOrg ? { id: DOCUMENT } : null,
      },
      file: {
        create: async ({ data }: { data: { kind: string } }) => ({ id: OWN_FILE, ...data }),
        update: async () => ({}),
      },
    };
    const storage = {
      put: async (key: string) => {
        put.push(key);
      },
      presignedGetUrl: async (key: string) => `https://s3.local/${key}`,
    };
    return { service: new DocumentsService(prisma as never, storage as never), put };
  }

  it('кладёт файл картинкой материала', async () => {
    const { service, put } = uploadService(ORG);
    const result = await service.addAsset(ORG, DOCUMENT, Buffer.from('x'), png, 'logo.png');
    expect(result.fileId).toBe(OWN_FILE);
    expect(put).toEqual([`org/${ORG}/doc/${DOCUMENT}/asset/${OWN_FILE}.png`]);
  });

  it('в чужой материал не загружает и отвечает 404', async () => {
    const { service, put } = uploadService(OTHER_ORG);
    await expect(
      service.addAsset(ORG, DOCUMENT, Buffer.from('x'), png, 'logo.png'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(put).toHaveLength(0);
  });
});
