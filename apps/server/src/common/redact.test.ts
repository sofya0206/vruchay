import { describe, expect, it } from 'vitest';
import { maskEmail, redact } from './redact';

describe('маскирование персональных данных', () => {
  it('прячет адрес, оставляя домен для диагностики', () => {
    expect(maskEmail('ivanov@example.ru')).toBe('i***@example.ru');
  });

  it('вычищает адрес из ответа почтового шлюза', () => {
    const smtp = '550 5.1.1 <ivanov@example.ru>: Recipient address rejected: User unknown';
    const clean = redact(smtp);
    expect(clean).not.toContain('ivanov@example.ru');
    expect(clean).toContain('i***@example.ru');
    // Код ошибки должен остаться: без него сообщение бесполезно.
    expect(clean).toContain('550 5.1.1');
  });

  it('вычищает несколько адресов сразу', () => {
    const clean = redact('от petrov@mail.ru кому anna@gmail.com');
    expect(clean).not.toMatch(/petrov@mail\.ru|anna@gmail\.com/);
  });

  it('прячет российские телефоны в любом формате', () => {
    for (const phone of ['+7 (903) 697-31-13', '89036973113', '+79036973113']) {
      expect(redact(`звонить ${phone}`)).not.toContain('9036973113'.slice(0, 7));
    }
  });

  it('не портит текст без персональных данных', () => {
    expect(redact('Задание 42 завершено, ошибок 0')).toBe('Задание 42 завершено, ошибок 0');
  });
});
