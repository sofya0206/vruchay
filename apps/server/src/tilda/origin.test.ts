import { describe, expect, it } from 'vitest';
import { hostFrom, isOriginAllowed, normalizeDomain } from './origin';

describe('hostFrom', () => {
  it('вытаскивает хост из Origin и Referer', () => {
    expect(hostFrom('https://sca-swimming.com')).toBe('sca-swimming.com');
    expect(hostFrom('https://sca-swimming.com/awards/page?a=1')).toBe('sca-swimming.com');
    expect(hostFrom('https://WWW.Sca-Swimming.com')).toBe('sca-swimming.com');
  });

  it('не падает на мусоре и не выдаёт его за разрешённый домен', () => {
    for (const bad of [undefined, '', 'не ссылка', '://', 'null', 'javascript:alert(1)']) {
      expect(() => hostFrom(bad)).not.toThrow();
      // Что бы разбор ни вернул, совпасть с реальным доменом это не должно.
      expect(isOriginAllowed(bad, undefined, ['sca-swimming.com'])).toBe(false);
    }
  });
});

describe('normalizeDomain', () => {
  it('приводит то, что вводит пользователь, к чистому хосту', () => {
    expect(normalizeDomain('  https://WWW.Example.RU/page  ')).toBe('example.ru');
  });
});

describe('isOriginAllowed', () => {
  const allowed = ['sca-swimming.com', 'https://edu.bfla.eu/'];

  it('пропускает разрешённый домен', () => {
    expect(isOriginAllowed('https://sca-swimming.com', undefined, allowed)).toBe(true);
  });

  it('пропускает поддомен — у федераций часто отдельная страница', () => {
    expect(isOriginAllowed('https://awards.sca-swimming.com', undefined, allowed)).toBe(true);
  });

  it('отклоняет чужой домен', () => {
    expect(isOriginAllowed('https://evil.com', undefined, allowed)).toBe(false);
  });

  it('не даёт обмануть себя похожим именем', () => {
    // Домен, заканчивающийся так же, но не являющийся поддоменом.
    expect(isOriginAllowed('https://evil-sca-swimming.com', undefined, allowed)).toBe(false);
    expect(isOriginAllowed('https://sca-swimming.com.evil.ru', undefined, allowed)).toBe(false);
  });

  it('падает обратно на Referer, если Origin не передан', () => {
    expect(isOriginAllowed(undefined, 'https://sca-swimming.com/page', allowed)).toBe(true);
  });

  it('отклоняет запрос без источника вовсе', () => {
    expect(isOriginAllowed(undefined, undefined, allowed)).toBe(false);
  });

  it('пустой список разрешённых доменов не пропускает никого', () => {
    expect(isOriginAllowed('https://sca-swimming.com', undefined, [])).toBe(false);
  });
});
