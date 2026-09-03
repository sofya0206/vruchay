import { NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { PublicOrgService } from './public-org.service';

interface Org {
  id: string;
  slug: string | null;
  name: string;
  publicPageEnabled: boolean;
  publicSearchByName: boolean;
  publicIndexable: boolean;
  verifiedIssuer: boolean;
  verifyNameMode: 'full' | 'initials' | 'none';
  description: string;
  inn: string;
  website: string;
  contactEmail: string;
  contactPhone: string;
  verifiedAt: Date | null;
  logo: { s3Key: string } | null;
}

interface Issued {
  orgId: string;
  documentId: string;
  publicId: string;
  publicCode: string | null;
  createdAt: Date;
  expiresAt: Date | null;
  verifyRevoked: boolean;
  replacedById: string | null;
  issuedData: Record<string, string> | null;
  row: { data: Record<string, string> } | null;
  document: { title: string; eventName: string; eventDate: string };
}

function org(over: Partial<Org> = {}): Org {
  return {
    id: 'org-1',
    slug: 'federation',
    name: 'Федерация плавания',
    publicPageEnabled: true,
    publicSearchByName: false,
    publicIndexable: false,
    verifiedIssuer: false,
    verifyNameMode: 'full',
    description: '',
    inn: '',
    website: '',
    contactEmail: '',
    contactPhone: '',
    verifiedAt: null,
    logo: null,
    ...over,
  };
}

function issued(over: Partial<Issued> = {}): Issued {
  return {
    orgId: 'org-1',
    documentId: 'doc-1',
    publicId: '11111111-1111-4111-8111-111111111111',
    publicCode: 'K7M2-9QXR-4TVB',
    createdAt: new Date('2026-06-17T09:00:00Z'),
    expiresAt: null,
    verifyRevoked: false,
    replacedById: null,
    issuedData: { name: 'Иванов Пётр Ильич' },
    row: { data: { name: 'Иванов Пётр Ильич' } },
    document: { title: 'Диплом', eventName: 'Первенство', eventDate: '2026' },
    ...over,
  };
}

/**
 * Подделка Prisma: организации ищутся по адресу и флагу публикации,
 * файлы — по организации, номеру и вхождению имени в снимок.
 */
function serviceWith(orgs: Org[], files: Issued[]) {
  const prisma = {
    organization: {
      findFirst: async ({ where }: { where: { slug: string; publicPageEnabled: boolean } }) =>
        orgs.find(
          (o) => o.slug === where.slug && o.publicPageEnabled === where.publicPageEnabled,
        ) ?? null,
    },
    document: {
      findMany: async ({ where }: { where: { id: { in: string[] }; orgId: string } }) =>
        [...new Set(files.filter((f) => f.orgId === where.orgId).map((f) => f.documentId))]
          .filter((id) => where.id.in.includes(id))
          .map((id) => ({ id, ...files.find((f) => f.documentId === id)!.document })),
    },
    file: {
      groupBy: async ({ where }: { where: { orgId: string } }) => {
        const mine = files.filter((f) => f.orgId === where.orgId);
        const ids = [...new Set(mine.map((f) => f.documentId))];
        return ids.map((documentId) => {
          const own = mine.filter((f) => f.documentId === documentId);
          const times = own.map((f) => f.createdAt.getTime());
          return {
            documentId,
            _count: { _all: own.length },
            _min: { createdAt: new Date(Math.min(...times)) },
            _max: { createdAt: new Date(Math.max(...times)) },
          };
        });
      },
      findFirst: async ({
        where,
      }: {
        where: { orgId: string; publicId?: string; publicCode?: string };
      }) =>
        files.find(
          (f) =>
            f.orgId === where.orgId &&
            (where.publicId ? f.publicId === where.publicId : f.publicCode === where.publicCode),
        ) ?? null,
      findMany: async ({
        where,
        take,
      }: {
        where: { orgId: string; OR: { issuedData?: { string_contains?: string } }[] };
        take: number;
      }) => {
        const needle = (where.OR[0].issuedData?.string_contains ?? '').toLowerCase();
        return files
          .filter(
            (f) =>
              f.orgId === where.orgId &&
              (f.issuedData?.name ?? f.row?.data.name ?? '').toLowerCase().includes(needle),
          )
          .slice(0, take);
      },
    },
  };
  const storage = { presignedGetUrl: async (key: string) => `https://s3/${key}` };
  return new PublicOrgService(prisma as never, storage as never);
}

describe('публичный реестр эмитента', () => {
  it('открыт без входа, но только для организаций, включивших страницу', async () => {
    const service = serviceWith(
      [org(), org({ id: 'org-2', slug: 'closed', publicPageEnabled: false })],
      [issued()],
    );

    const page = await service.page('federation');
    expect(page.name).toBe('Федерация плавания');
    expect(page.programs).toEqual([
      expect.objectContaining({ id: 'doc-1', title: 'Диплом', issued: 1 }),
    ]);
    expect(page.searchByName).toBe(false);

    await expect(service.page('closed')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.page('nobody')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('по номеру документа ищет всегда — в любом написании, и только своё', async () => {
    const service = serviceWith(
      [org()],
      [issued(), issued({ orgId: 'other', publicCode: 'AAAA-BBBB-CCCD' })],
    );

    expect(await service.findByCode('federation', 'k7m2 9qxr 4tvb')).toEqual({
      path: '/c/K7M2-9QXR-4TVB',
    });
    expect(await service.findByCode('federation', '11111111-1111-4111-8111-111111111111')).toEqual({
      path: '/c/K7M2-9QXR-4TVB',
    });
    await expect(service.findByCode('federation', 'AAAA-BBBB-CCCD')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.findByCode('federation', 'мусор')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('поиск по ФИО выключен по умолчанию и отвечает «не найдено»', async () => {
    const service = serviceWith([org()], [issued()]);
    await expect(service.searchByName('federation', 'Иванов')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('включённый поиск по ФИО показывает имя так, как разрешил эмитент', async () => {
    const service = serviceWith(
      [org({ publicSearchByName: true, verifyNameMode: 'initials' })],
      [issued(), issued({ publicCode: 'ZZZZ-YYYY-XXXW', issuedData: { name: 'Петров Илья' } })],
    );

    const { items } = await service.searchByName('federation', 'иванов');
    expect(items).toHaveLength(1);
    expect(items[0].name.replace(/\u00a0/g, ' ')).toBe('Иванов П. И.');
    expect(items[0].path).toBe('/c/K7M2-9QXR-4TVB');
    expect(items[0].state).toBe('valid');

    // Короткий запрос не ищет: «Ив» вернул бы половину реестра.
    expect(await service.searchByName('federation', 'Ив')).toEqual({ items: [] });
  });
});
