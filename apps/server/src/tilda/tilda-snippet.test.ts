import { describe, expect, it } from 'vitest';
import { buildTildaScript, type PublicConfig } from './tilda-snippet';

/**
 * Настройки интеграции задаёт клиент, а попадают они прямо в текст скрипта,
 * который выполняется на его сайте. Значит, кавычка в сообщении об успехе
 * не должна разрывать литерал: иначе клиент — случайно или намеренно —
 * выполнит на своей странице произвольный код, а страдать будут посетители.
 */
const base: PublicConfig = {
  token: '11111111-2222-3333-4444-555555555555',
  authMode: 'email_code',
  successMessage: 'Готово',
  showDownload: true,
  consentText: '',
  consentVersion: '2026-08-02',
};

function evaluatable(script: string): void {
  // Разбор без выполнения: браузерных объектов здесь нет, а синтаксис проверяется.
  expect(() => new Function(script)).not.toThrow();
}

describe('скрипт формы', () => {
  it('собирается в корректный JavaScript', () => {
    evaluatable(buildTildaScript('https://vruchay.ru', base));
  });

  it('не разрывается кавычками в сообщении', () => {
    const script = buildTildaScript('https://vruchay.ru', {
      ...base,
      successMessage: 'Готово"; alert(1); var x = "',
    });
    evaluatable(script);
    expect(script).not.toContain('alert(1);\n');
  });

  it('не разрывается переводом строки и обратным слэшем', () => {
    const script = buildTildaScript('https://vruchay.ru', {
      ...base,
      successMessage: 'Первая строка\nвторая \\ строка',
    });
    evaluatable(script);
  });

  it('подставляет адрес приложения без завершающего слэша', () => {
    const script = buildTildaScript('https://vruchay.ru', base);
    expect(script).toContain('var API = "https://vruchay.ru"');
    expect(script).toContain("'/api/v1/tilda/submit'");
  });

  it('переносит режим подтверждения и токен', () => {
    const script = buildTildaScript('https://vruchay.ru', { ...base, authMode: 'none' });
    expect(script).toContain('authMode: "none"');
    expect(script).toContain(`token: "${base.token}"`);
  });
});
