import { describe, expect, it } from 'vitest';
import { SECTIONS, activeSection } from './sections';

/*
 * Подсветка раздела — не украшение: по ней человек понимает, где он.
 * Ошибка здесь незаметна в разработке и мучительна в работе, поэтому
 * проверяем самые обидные случаи, а не наличие подписи.
 */

describe('открытый раздел', () => {
  it('«Главное» подсвечивается только на самой главной', () => {
    expect(activeSection('/')).toBe('/');
    expect(activeSection('/documents')).toBe('/documents');
    expect(activeSection('/registry')).toBe('/registry');
    expect(activeSection('/analytics')).toBe('/analytics');
  });

  it('редактор материала относится к «Документам»', () => {
    // Иначе человек, открывший материал, оказывается в кабинете без раздела.
    expect(activeSection('/documents/8f0e6a0e-0f5b-4a1a-9c3a-2f2b1d4e5c6a')).toBe('/documents');
  });

  it('чужой адрес не подсвечивает ничего', () => {
    expect(activeSection('/settings')).toBeNull();
    expect(activeSection('/invoices')).toBeNull();
  });

  it('раздел не путается с тем, чей адрес просто начинается так же', () => {
    expect(activeSection('/documentsomething')).toBeNull();
  });
});

describe('состав навигации', () => {
  it('семь разделов, настроек среди них нет', () => {
    expect(SECTIONS.map((s) => s.label)).toEqual([
      'Главное',
      'Документы',
      'Рассылка',
      'Реестр',
      'Аналитика',
      'Интеграции',
      'Оплата',
    ]);
  });

  it('адреса не повторяются', () => {
    const paths = SECTIONS.map((s) => s.path);
    expect(new Set(paths).size).toBe(paths.length);
  });
});
