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

  it('документ целиком — «Документы», где бы внутри него ни стоял человек', () => {
    const id = '8f0e6a0e-0f5b-4a1a-9c3a-2f2b1d4e5c6a';
    expect(activeNav(`/documents/${id}`)).toBe('documents');
    expect(activeNav(`/documents/${id}/recipients`)).toBe('documents');
    expect(activeNav(`/documents/${id}/check`)).toBe('documents');
    expect(activeNav(`/documents/${id}/issue`)).toBe('documents');
  });

  it('журнал писем и сводка — «Письма»', () => {
    expect(activeNav('/mailing')).toBe('mail');
    expect(activeNav('/mailing/stats')).toBe('mail');
  });

  it('аналитика живёт под реестром', () => {
    expect(activeNav('/registry')).toBe('registry');
    expect(activeNav('/analytics')).toBe('registry');
  });

  it('служебное не подсвечивает пункты', () => {
    expect(activeNav('/settings')).toBeNull();
    expect(activeNav('/settings/billing')).toBeNull();
    expect(activeNav('/invoices')).toBeNull();
  });

  it('в полосе три работы с разными адресами', () => {
    expect(NAV_ITEMS).toHaveLength(3);
    const tos = NAV_ITEMS.map((i) => i.to);
    expect(new Set(tos).size).toBe(tos.length);
  });
});
