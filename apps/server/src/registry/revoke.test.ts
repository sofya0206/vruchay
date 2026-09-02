import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { testConfig } from '../config/env.test-utils';
import { RegistryActionsService } from './registry-actions.service';
import { revokePreviewSchema, revokeSchema } from './registry.dto';

const DOC = '11111111-1111-4111-8111-111111111111';
const A = '22222222-2222-4222-8222-222222222222';
const B = '33333333-3333-4333-8333-333333333333';

/** Выданный документ, каким его видит отзыв. */
interface Issued {
  id: string;
  orgId: string;
  documentId: string;
  kind: string;
  deletedAt: Date | null;
  s3Key: string;
  createdAt: Date;
  verifyRevoked: boolean;
  revokedAt: Date | null;
  revokedReasonPublic: string | null;
  revokedReasonInternal: string | null;
  replacedById: string | null;
  expiresAt: Date | null;
  publicId: string;
  publicCode: string | null;
  row: { data: Record<string, string> } | null;
  document: { title: string } | null;
}

function issued(over: Partial<Issued> = {}): Issued {
  return {
    id: A,
    orgId: 'org',
    documentId: DOC,
    kind: 'generated',
    deletedAt: null,
    s3Key: 'key',
    createdAt: new Date('2026-06-17T09:00:00Z'),
    verifyRevoked: false,
    revokedAt: null,
    revokedReasonPublic: null,
    revokedReasonInternal: null,
    replacedById: null,
    expiresAt: null,
    publicId: A,
    publicCode: 'K7M2-9QXR-4TVB',
    row: { data: { name: 'Иванова Анна' } },
    document: { title: 'Грамота' },
    ...over,
  };
}

/**
 * Подделка Prisma, которая понимает ровно два условия, которыми пользуется
 * отзыв: по списку идентификаторов и по материалу. Организация проверяется
 * всегда — чужой документ не должен найтись ни одним из путей.
 */
function serviceWith(files: Issued[]) {
  const updates: { ids: string[]; data: Record<string, unknown> }[] = [];
  const matches = (f: Issued, where: Record<string, unknown>) => {
    if (where.orgId !== f.orgId) return false;
    const ids = (where.id as { in: string[] } | undefined)?.in;
    if (ids && !ids.includes(f.id)) return false;
    if (where.documentId && where.documentId !== f.documentId) return false;
    if (where.verifyRevoked !== undefined && where.verifyRevoked !== f.verifyRevoked) return false;
    return true;
  };
  const prisma = {
    file: {
      findMany: async ({ where, take }: { where: Record<string, unknown>; take?: number }) =>
        files.filter((f) => matches(f, where)).slice(0, take),
      count: async ({ where }: { where: Record<string, unknown> }) =>
        files.filter((f) => matches(f, where)).length,
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: { in: string[] }; orgId: string };
        data: Record<string, unknown>;
      }) => {
        updates.push({ ids: where.id.in, data });
        for (const f of files)
          if (where.id.in.includes(f.id) && f.orgId === where.orgId) Object.assign(f, data);
        return { count: where.id.in.length };
      },
    },
  };
  const service = new RegistryActionsService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    testConfig() as never,
  );
  return { service, updates };
}

describe('массовый отзыв: схема запроса', () => {
  it('принимает либо отмеченные документы, либо отбор, но не оба и не ничего', () => {
    expect(revokeSchema.safeParse({ fileIds: [A], revoked: true, expectedCount: 1 }).success).toBe(
      true,
    );
    expect(
      revokeSchema.safeParse({ filter: { documentId: DOC }, revoked: true, expectedCount: 3 })
        .success,
    ).toBe(true);
    expect(revokeSchema.safeParse({ revoked: true, expectedCount: 1 }).success).toBe(false);
    expect(
      revokeSchema.safeParse({
        fileIds: [A],
        filter: { documentId: DOC },
        revoked: true,
        expectedCount: 1,
      }).success,
    ).toBe(false);
  });

  it('отбор без сужения не принимается: пустой отбор — это всё выданное', () => {
    const result = revokeSchema.safeParse({ filter: {}, revoked: true, expectedCount: 5 });
    expect(result.success).toBe(false);
    expect(revokePreviewSchema.safeParse({ filter: { state: 'valid' } }).success).toBe(false);
    expect(revokePreviewSchema.safeParse({ filter: { event: 'Кубок' } }).success).toBe(true);
  });

  it('без подтверждающего числа отзыв не принимается', () => {
    expect(revokeSchema.safeParse({ fileIds: [A], revoked: true }).success).toBe(false);
    expect(revokeSchema.safeParse({ fileIds: [A], revoked: true, expectedCount: 0 }).success).toBe(
      false,
    );
  });

  it('возврат проверки — только по отмеченным, не по отбору', () => {
    expect(
      revokeSchema.safeParse({ filter: { documentId: DOC }, revoked: false, expectedCount: 1 })
        .success,
    ).toBe(false);
    expect(revokeSchema.safeParse({ fileIds: [A], revoked: false, expectedCount: 1 }).success).toBe(
      true,
    );
  });
});

describe('массовый отзыв: подтверждение по количеству', () => {
  it('отзывает всё найденное по материалу, когда число сходится', async () => {
    const files = [issued({ id: A }), issued({ id: B, publicId: B })];
    const { service, updates } = serviceWith(files);

    const result = await service.setRevoked('org', { filter: { documentId: DOC } }, true, {
      expectedCount: 2,
      reasonPublic: 'Выдан по ошибке',
      reasonInternal: 'Перепутали протоколы',
    });

    expect(result.changed).toBe(2);
    expect(updates).toHaveLength(1);
    expect(updates[0].ids.sort()).toEqual([A, B].sort());
    expect(updates[0].data).toMatchObject({
      verifyRevoked: true,
      revokedReasonPublic: 'Выдан по ошибке',
      revokedReasonInternal: 'Перепутали протоколы',
    });
    expect(updates[0].data.revokedAt).toBeInstanceOf(Date);
  });

  it('отказывает, если список успел измениться', async () => {
    const { service, updates } = serviceWith([issued({ id: A }), issued({ id: B, publicId: B })]);

    await expect(
      service.setRevoked('org', { filter: { documentId: DOC } }, true, { expectedCount: 1 }),
    ).rejects.toThrow('Список изменился');
    expect(updates).toHaveLength(0);
  });

  it('возврат снимает отметку и не трогает причины — это история документа', async () => {
    const file = issued({
      verifyRevoked: true,
      revokedAt: new Date('2026-07-01T00:00:00Z'),
      revokedReasonPublic: 'Выдан по ошибке',
    });
    const { service } = serviceWith([file]);

    await service.setRevoked('org', [A], false, { expectedCount: 1 });

    expect(file.verifyRevoked).toBe(false);
    expect(file.revokedReasonPublic).toBe('Выдан по ошибке');
    expect(file.revokedAt).toEqual(new Date('2026-07-01T00:00:00Z'));
  });

  it('чужой документ не находится ни по списку, ни по отбору', async () => {
    const { service } = serviceWith([issued({ orgId: 'other' })]);
    await expect(service.setRevoked('org', [A], true)).rejects.toThrow('Ни один из документов');
    await expect(
      service.previewRevoke('org', { filter: { documentId: DOC } }),
    ).resolves.toMatchObject({ count: 0, sample: [] });
  });

  it('предпросмотр отдаёт число, уже отозванных и первые имена', async () => {
    const { service } = serviceWith([
      issued({ id: A }),
      issued({ id: B, publicId: B, verifyRevoked: true, row: { data: { name: 'Петров Илья' } } }),
    ]);

    const preview = await service.previewRevoke('org', { filter: { documentId: DOC } });

    expect(preview.count).toBe(2);
    expect(preview.alreadyRevoked).toBe(1);
    expect(preview.sample.map((s) => s.name)).toEqual(['Иванова Анна', 'Петров Илья']);
    expect(preview.sample[1].state).toBe('revoked');
    expect(preview.sample[0].code).toBe('K7M2-9QXR-4TVB');
  });

  it('без цели отзывать нечего', async () => {
    const { service } = serviceWith([issued()]);
    await expect(service.setRevoked('org', {}, true)).rejects.toBeInstanceOf(BadRequestException);
  });
});
