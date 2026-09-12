import { describe, expect, it } from 'vitest';
import { NAV_ITEMS, activeNav } from './nav';

/*
 * Подсветка пункта полосы — не украшение: по ней человек понимает, где он.
 * Ошибка здесь незаметна в разработке и мучительна в работе.
 */
describe('открытый пункт полосы', () => {
  it('главная не подсвечивает ничего: она не пункт, а знак', () => {
    expect(activeNav('/')).toBeNull();
  });

  it('материал и его письмо — это «Документы», журнал писем — «Письма»', () => {
    // Иначе человек, открывший материал, оказывается в кабинете без раздела.
    expect(activeNav('/documents/8f0e6a0e-0f5b-4a1a-9c3a-2f2b1d4e5c6a')).toBe('documents');
    expect(activeNav('/mailing/8f0e6a0e-0f5b-4a1a-9c3a-2f2b1d4e5c6a')).toBe('documents');
    expect(activeNav('/mailing')).toBe('mail');
  });

  it('аналитика живёт под реестром', () => {
    expect(activeNav('/registry?tab=analytics'.split('?')[0])).toBe('registry');
    expect(activeNav('/analytics')).toBe('registry');
  });

  it('служебное не подсвечивает пункты', () => {
    expect(activeNav('/settings')).toBeNull();
    expect(activeNav('/invoices')).toBeNull();
  });

  it('в полосе пять пунктов с разными адресами', () => {
    expect(NAV_ITEMS).toHaveLength(5);
    const tos = NAV_ITEMS.map((i) => i.to);
    expect(new Set(tos).size).toBe(tos.length);
  });
});
