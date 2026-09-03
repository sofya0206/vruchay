import { describe, expect, it } from 'vitest';
import { decryptTotpSecret, encryptTotpSecret, hashBackupCode } from './totp-crypto';

const KEY = 'ключ-для-тестов-не-короче-шестнадцати';

describe('шифрование секрета TOTP', () => {
  it('расшифровывается тем же ключом и не хранит секрет открытым текстом', () => {
    const stored = encryptTotpSecret('JBSWY3DPEHPK3PXP', KEY);
    expect(stored).not.toContain('JBSWY3DPEHPK3PXP');
    expect(stored.startsWith('v1.')).toBe(true);
    expect(decryptTotpSecret(stored, KEY)).toBe('JBSWY3DPEHPK3PXP');
  });

  it('каждый раз новый вектор: одинаковые секреты выглядят по-разному', () => {
    expect(encryptTotpSecret('JBSWY3DPEHPK3PXP', KEY)).not.toBe(
      encryptTotpSecret('JBSWY3DPEHPK3PXP', KEY),
    );
  });

  it('чужой ключ или подправленный шифртекст — ошибка, а не мусор', () => {
    const stored = encryptTotpSecret('JBSWY3DPEHPK3PXP', KEY);
    expect(() => decryptTotpSecret(stored, 'другой-ключ-тоже-достаточно-длинный')).toThrow();
    const tampered = stored.slice(0, -2) + (stored.endsWith('A') ? 'BB' : 'AA');
    expect(() => decryptTotpSecret(tampered, KEY)).toThrow();
  });

  it('незнакомый формат не пытается расшифровываться', () => {
    expect(() => decryptTotpSecret('просто-строка', KEY)).toThrow(/формат/);
  });
});

describe('хеш резервного кода', () => {
  it('детерминирован и зависит от ключа', () => {
    expect(hashBackupCode('ABCDE23456', KEY)).toBe(hashBackupCode('ABCDE23456', KEY));
    expect(hashBackupCode('ABCDE23456', KEY)).not.toBe(hashBackupCode('ABCDE23456', KEY + 'x'));
    expect(hashBackupCode('ABCDE23456', KEY)).not.toContain('ABCDE');
  });
});
