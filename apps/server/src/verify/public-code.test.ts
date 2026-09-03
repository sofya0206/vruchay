import { describe, expect, it } from 'vitest';
import {
  CROCKFORD_ALPHABET,
  generatePublicCode,
  hasValidTail,
  looksLikePublicCode,
  normalizePublicCode,
} from './public-code';

const SECRET = 'x'.repeat(48);

describe('публичный код документа', () => {
  it('имеет вид XXXX-XXXX-XXXX из алфавита Крокфорда', () => {
    for (let i = 0; i < 200; i++) {
      const code = generatePublicCode(SECRET);
      expect(code).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
      for (const ch of code.replace(/-/g, '')) expect(CROCKFORD_ALPHABET).toContain(ch);
      // Буквы, которые путают с цифрами, в код не попадают никогда.
      expect(code).not.toMatch(/[ILOU]/);
    }
  });

  it('хвост сходится со своим секретом и не сходится с чужим', () => {
    const code = generatePublicCode(SECRET);
    expect(hasValidTail(code, SECRET)).toBe(true);
    expect(hasValidTail(code, 'y'.repeat(48))).toBe(false);
  });

  it('опечатка в любом знаке ломает хвост', () => {
    const code = generatePublicCode(SECRET);
    const raw = code.replace(/-/g, '');
    let caught = 0;
    for (let i = 0; i < raw.length; i++) {
      const other = CROCKFORD_ALPHABET[(CROCKFORD_ALPHABET.indexOf(raw[i]) + 1) % 32];
      const typo = raw.slice(0, i) + other + raw.slice(i + 1);
      if (!hasValidTail(normalizePublicCode(typo)!, SECRET)) caught++;
    }
    // Хвост в 20 бит ловит одиночную опечатку почти всегда; «почти» —
    // это одна на миллион, и в двенадцати попытках её не бывает.
    expect(caught).toBe(raw.length);
  });

  it('коды не повторяются', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 5_000; i++) seen.add(generatePublicCode(SECRET));
    expect(seen.size).toBe(5_000);
  });

  it('принимает код так, как его диктуют: строчными, с пробелами, с O вместо нуля', () => {
    const code = 'K7M2-9QXR-4TVB';
    expect(normalizePublicCode('k7m2 9qxr 4tvb')).toBe(code);
    expect(normalizePublicCode('K7M29QXR4TVB')).toBe(code);
    expect(normalizePublicCode(' k7m2-9qxr-4tvb ')).toBe(code);
    expect(normalizePublicCode('0123-4567-89AB')).toBe('0123-4567-89AB');
    expect(normalizePublicCode('OI23-4567-89AB')).toBe('0123-4567-89AB');
    expect(normalizePublicCode('ol23-4567-89ab')).toBe('0123-4567-89AB');
  });

  it('отвергает то, что кодом быть не может', () => {
    expect(normalizePublicCode('')).toBeNull();
    expect(normalizePublicCode('K7M2-9QXR')).toBeNull();
    expect(normalizePublicCode('K7M2-9QXR-4TVB-0000')).toBeNull();
    // U не входит в алфавит Крокфорда.
    expect(normalizePublicCode('K7M2-9QXR-4TVU')).toBeNull();
    expect(normalizePublicCode('к7м2-9qxr-4tvb')).toBeNull();
    expect(normalizePublicCode('00000000-0000-4000-8000-000000000000')).toBeNull();
  });

  it('отличает форму кода от UUID', () => {
    expect(looksLikePublicCode('K7M2-9QXR-4TVB')).toBe(true);
    expect(looksLikePublicCode('k7m2-9qxr-4tvb')).toBe(false);
    expect(looksLikePublicCode('00000000-0000-4000-8000-000000000000')).toBe(false);
  });
});
