import { describe, expect, it } from 'vitest';
import { expiryNoticeLetter } from './expiry-notice';

describe('письмо о скором истечении срока', () => {
  const letter = expiryNoticeLetter({
    title: 'Сертификат инструктора',
    eventName: 'Курс 2025',
    orgName: 'Федерация плавания',
    expiresAt: new Date('2026-07-01T00:00:00.000Z'),
    verifyUrl: 'https://vruchay.ru/c/K7M2-9QXR-4TVB',
  });

  it('называет документ, дату и ссылку на проверку', () => {
    expect(letter.subject).toBe(
      'Срок действия документа «Сертификат инструктора» истекает 1 июля 2026 г.',
    );
    expect(letter.bodyHtml).toContain('«Сертификат инструктора» (Курс 2025)');
    expect(letter.bodyHtml).toContain('Федерация плавания');
    expect(letter.bodyHtml).toContain('<strong>1 июля 2026 г.</strong>');
    expect(letter.bodyHtml).toContain('href="https://vruchay.ru/c/K7M2-9QXR-4TVB"');
  });

  it('экранирует то, что задаёт организация', () => {
    const hostile = expiryNoticeLetter({
      title: '<img src=x onerror=alert(1)>',
      eventName: '',
      orgName: 'ООО «Рога & Копыта»',
      expiresAt: new Date('2026-07-01T00:00:00.000Z'),
      verifyUrl: 'https://vruchay.ru/c/K7M2-9QXR-4TVB',
    });
    expect(hostile.bodyHtml).not.toContain('<img');
    expect(hostile.bodyHtml).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(hostile.bodyHtml).toContain('Рога &amp; Копыта');
    // Без мероприятия — без пустых скобок.
    expect(hostile.bodyHtml).not.toContain('()');
  });
});
