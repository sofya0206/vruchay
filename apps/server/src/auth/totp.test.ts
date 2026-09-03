import { describe, expect, it } from 'vitest';
import {
  base32Decode,
  base32Encode,
  generateBackupCodes,
  generateTotpSecret,
  hotp,
  normalizeBackupCode,
  otpauthUrl,
  totp,
  verifyTotp,
} from './totp';

/*
 * Второй фактор входа у живых клиентов: если код считается не так, как
 * в приложении на телефоне, человек не сможет войти вовсе. Поэтому
 * сверяемся с контрольными значениями из самих RFC, а не со своей же
 * реализацией.
 */

/** Секрет из приложения B RFC 6238 и RFC 4226: «12345678901234567890». */
const RFC_SECRET = Buffer.from('12345678901234567890', 'ascii');
const RFC_SECRET_B32 = base32Encode(RFC_SECRET);

describe('HOTP по RFC 4226', () => {
  it('первые контрольные значения из приложения D', () => {
    const expected = ['755224', '287082', '359152', '969429', '338314', '254676'];
    expected.forEach((code, i) => expect(hotp(RFC_SECRET, BigInt(i))).toBe(code));
  });
});

describe('TOTP по RFC 6238', () => {
  it('контрольные значения SHA-1 из приложения B (последние шесть цифр)', () => {
    // В RFC коды восьмизначные; шестизначные — их последние шесть цифр.
    expect(totp(RFC_SECRET_B32, 59)).toBe('287082');
    expect(totp(RFC_SECRET_B32, 1111111109)).toBe('081804');
    expect(totp(RFC_SECRET_B32, 1111111111)).toBe('050471');
    expect(totp(RFC_SECRET_B32, 1234567890)).toBe('005924');
    expect(totp(RFC_SECRET_B32, 2000000000)).toBe('279037');
    expect(totp(RFC_SECRET_B32, 20000000000)).toBe('353130');
  });

  it('код соседнего шага принимается, через два шага — нет', () => {
    const at = 1111111111;
    const previous = totp(RFC_SECRET_B32, at - 30);
    const stale = totp(RFC_SECRET_B32, at - 90);
    expect(verifyTotp(RFC_SECRET_B32, previous, at)).not.toBeNull();
    expect(verifyTotp(RFC_SECRET_B32, stale, at)).toBeNull();
  });

  it('пробелы в коде не мешают, а буквы и неполный код отвергаются', () => {
    expect(verifyTotp(RFC_SECRET_B32, '050 471', 1111111111)).not.toBeNull();
    expect(verifyTotp(RFC_SECRET_B32, '05047', 1111111111)).toBeNull();
    expect(verifyTotp(RFC_SECRET_B32, '05047a', 1111111111)).toBeNull();
  });

  it('возвращает шаг, которым код подошёл, — для защиты от повтора', () => {
    expect(verifyTotp(RFC_SECRET_B32, '050471', 1111111111)).toBe(37037037n);
  });
});

describe('base32', () => {
  it('туда и обратно без потерь, без дополнения «=»', () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32Encode(base32Decode(secret))).toBe(secret);
  });

  it('разбор терпит строчные буквы и пробелы — так секрет диктуют вслух', () => {
    expect(base32Decode('gezd gnbv gy3t qojq')).toEqual(Buffer.from('1234567890'));
  });
});

describe('ссылка для QR', () => {
  it('содержит секрет, эмитента и параметры, которые понимают приложения', () => {
    const url = otpauthUrl({ secret: 'ABC234', account: 'trener@example.ru', issuer: 'Вручай' });
    expect(url.startsWith('otpauth://totp/')).toBe(true);
    expect(url).toContain('secret=ABC234');
    expect(url).toContain('digits=6');
    expect(url).toContain('period=30');
    expect(decodeURIComponent(url)).toContain('Вручай:trener@example.ru');
  });
});

describe('резервные коды', () => {
  it('десять разных кодов по десять знаков без похожих символов', () => {
    const codes = generateBackupCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const code of codes) {
      expect(code).toMatch(
        /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$/,
      );
    }
  });

  it('с бумажки код принимается в любом виде', () => {
    expect(normalizeBackupCode('abcde-23456')).toBe('ABCDE23456');
    expect(normalizeBackupCode(' ABCDE 23456 ')).toBe('ABCDE23456');
  });
});
