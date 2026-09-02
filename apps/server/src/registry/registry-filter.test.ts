import { describe, expect, it } from 'vitest';
import { registryWhere } from './registry-filter';
import { fileState } from './file-state';

const ORG = '11111111-1111-4111-8111-111111111111';

describe('условие выборки реестра', () => {
  it('всегда ограничено организацией и выданными файлами с байтами', () => {
    const where = registryWhere(ORG, {});
    expect(where.orgId).toBe(ORG);
    expect(where.kind).toBe('generated');
    expect(where.deletedAt).toBeNull();
    expect(where.s3Key).toEqual({ not: '' });
  });

  it('состояния разводят отзыв и замену', () => {
    expect(registryWhere(ORG, { state: 'revoked' })).toMatchObject({ verifyRevoked: true });
    expect(registryWhere(ORG, { state: 'replaced' })).toMatchObject({
      verifyRevoked: false,
      replacedById: { not: null },
    });
    expect(registryWhere(ORG, { state: 'valid' })).toMatchObject({
      verifyRevoked: false,
      replacedById: null,
    });
  });

  it('обещанный, но не состоявшийся перевыпуск остаётся действительным', () => {
    // Пока замены нет, документ действителен: гасить настоящий сертификат
    // под обещание нового нельзя.
    expect(fileState({ verifyRevoked: false, replacedById: null })).toBe('valid');
    expect(fileState({ verifyRevoked: false, replacedById: 'f' })).toBe('replaced');
    expect(fileState({ verifyRevoked: true, replacedById: 'f' })).toBe('revoked');
  });

  it('верхняя граница периода включает весь названный день по Москве', () => {
    const where = registryWhere(ORG, { to: new Date('2026-08-31T00:00:00.000Z') });
    const range = where.createdAt as { lt: Date };
    // 1 сентября 00:00 по Москве — это 31 августа 21:00 UTC.
    expect(range.lt.toISOString()).toBe('2026-08-31T21:00:00.000Z');
  });

  it('нижняя граница периода начинается с полуночи по Москве', () => {
    const where = registryWhere(ORG, { from: new Date('2026-08-01T00:00:00.000Z') });
    const range = where.createdAt as { gte: Date };
    expect(range.gte.toISOString()).toBe('2026-07-31T21:00:00.000Z');
  });

  it('поиск идёт по фамилии и почте, а проверочный код — только целиком', () => {
    const byName = registryWhere(ORG, { search: 'Иванов' });
    expect(byName.OR).toHaveLength(2);

    const code = '22222222-2222-4222-8222-222222222222';
    const byCode = registryWhere(ORG, { search: code });
    expect(byCode.OR).toHaveLength(3);
    expect(byCode.OR).toContainEqual({ publicId: code });
  });

  it('«истёк» и «действителен» делят документы по сроку той же границей, что fileState', () => {
    const now = new Date('2026-06-17T12:00:00.000Z');

    const expired = registryWhere(ORG, { state: 'expired' }, [], now);
    expect(expired.verifyRevoked).toBe(false);
    expect(expired.replacedById).toBeNull();
    expect(expired.expiresAt).toEqual({ lte: now });

    const valid = registryWhere(ORG, { state: 'valid' }, [], now);
    expect(valid.AND).toEqual([{ OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }]);
  });

  it('короткий код ищется в любом написании и тоже только целиком', () => {
    // Так его диктуют по телефону: строчными, без дефисов, с O вместо нуля.
    const byShort = registryWhere(ORG, { search: 'k7m2 9qxr 4tvo' });
    expect(byShort.OR).toHaveLength(3);
    expect(byShort.OR).toContainEqual({ publicCode: 'K7M2-9QXR-4TV0' });

    // Кусок кода — это не код: перебирать чужие коды по частям нельзя.
    const byPart = registryWhere(ORG, { search: 'K7M2-9QXR' });
    expect(byPart.OR).toHaveLength(2);
  });

  it('отбор по отмеченным строкам не отменяет условие организации', () => {
    const where = registryWhere(ORG, {}, ['33333333-3333-4333-8333-333333333333']);
    expect(where.orgId).toBe(ORG);
    expect(where.id).toEqual({ in: ['33333333-3333-4333-8333-333333333333'] });
  });

  it('«письмо не отправлялось» — это отсутствие писем, а не их состояние', () => {
    expect(registryWhere(ORG, { mail: 'none' }).emails).toEqual({ none: {} });
    expect(registryWhere(ORG, { mail: 'bounced' }).emails).toEqual({
      some: { status: 'bounced', orgId: ORG },
    });
  });
});
