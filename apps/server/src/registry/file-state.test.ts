import { describe, expect, it } from 'vitest';
import { fileState } from './file-state';

const NOW = new Date('2026-06-17T12:00:00.000Z');

describe('состояние выданного документа', () => {
  it('без фактов — действителен, и бессрочный документ не истекает никогда', () => {
    expect(fileState({ verifyRevoked: false, replacedById: null }, NOW)).toBe('valid');
    expect(fileState({ verifyRevoked: false, replacedById: null, expiresAt: null }, NOW)).toBe(
      'valid',
    );
  });

  it('срок считается по границе: до момента истечения — действителен, с него — истёк', () => {
    const facts = { verifyRevoked: false, replacedById: null };
    const edge = new Date('2026-06-17T12:00:00.000Z');

    expect(fileState({ ...facts, expiresAt: edge }, new Date(edge.getTime() - 1))).toBe('valid');
    expect(fileState({ ...facts, expiresAt: edge }, edge)).toBe('expired');
    expect(fileState({ ...facts, expiresAt: edge }, new Date(edge.getTime() + 1))).toBe('expired');
  });

  it('отзыв сильнее замены, замена сильнее срока', () => {
    const past = new Date('2020-01-01T00:00:00.000Z');
    expect(fileState({ verifyRevoked: true, replacedById: 'new', expiresAt: past }, NOW)).toBe(
      'revoked',
    );
    expect(fileState({ verifyRevoked: false, replacedById: 'new', expiresAt: past }, NOW)).toBe(
      'replaced',
    );
    expect(fileState({ verifyRevoked: false, replacedById: null, expiresAt: past }, NOW)).toBe(
      'expired',
    );
  });
});
