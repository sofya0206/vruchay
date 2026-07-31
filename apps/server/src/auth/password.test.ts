import { describe, expect, it } from 'vitest';
import { hashPassword, validatePasswordStrength, verifyPassword } from './password';

describe('хеширование паролей', () => {
  it('проверяет верный пароль и отклоняет неверный', async () => {
    const hash = await hashPassword('Сертификат2026');
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(await verifyPassword(hash, 'Сертификат2026')).toBe(true);
    expect(await verifyPassword(hash, 'сертификат2026')).toBe(false);
  }, 20000);

  it('не падает на некорректном хеше', async () => {
    expect(await verifyPassword('не-хеш', 'что-угодно')).toBe(false);
  });
});

describe('validatePasswordStrength', () => {
  it('принимает нормальный пароль', () => {
    expect(validatePasswordStrength('Грамота2026')).toBeNull();
  });

  it('отклоняет короткий, без цифр и без букв', () => {
    expect(validatePasswordStrength('коротк1')).toMatch(/не короче/);
    expect(validatePasswordStrength('парольбезцифр')).toMatch(/цифру/);
    expect(validatePasswordStrength('1234567890')).toMatch(/букву/);
  });
});
