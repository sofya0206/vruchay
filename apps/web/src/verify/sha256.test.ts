import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { sameDigest, sha256Hex } from './sha256';

describe('отпечаток файла в браузере', () => {
  it('считает SHA-256 так же, как сервер при выпуске', async () => {
    const bytes = new TextEncoder().encode('%PDF-1.4 проверка');
    const expected = createHash('sha256').update(bytes).digest('hex');
    const digest = await sha256Hex(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    );
    expect(digest).toBe(expected);
  });

  it('пустой файл даёт известный отпечаток', async () => {
    expect(await sha256Hex(new ArrayBuffer(0))).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });

  it('сравнивает без учёта регистра и пробелов по краям', () => {
    expect(sameDigest(' ABCDEF ', 'abcdef')).toBe(true);
    expect(sameDigest('abcdef', 'abcdee')).toBe(false);
  });
});
