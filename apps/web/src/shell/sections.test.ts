import { describe, expect, it } from 'vitest';
import { SECTIONS, activeSection } from './sections';

/*
 * Подсветка раздела — не украшение: по ней человек понимает, где он.
 * Ошибка здесь незаметна в разработке и мучительна в работе, поэтому
 * проверяем самые обидные случаи, а не наличие подписи.
 */

describe('открытый раздел', () => {
  it('главная не считается разделом: она и есть навигация', () => {
    expect(activeSection('/')).toBeNull();
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
  it('пять разделов, настроек среди них нет', () => {
    // Рассылки здесь нет намеренно: в неё ведёт быстрое действие
    // на главной, и вторая дорога к тому же экрану только раздваивала бы
    // выбор. Шаблоны — часть «Документов», а не свой раздел.
    expect(SECTIONS.map((s) => s.label)).toEqual([
      'Документы и шаблоны',
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
