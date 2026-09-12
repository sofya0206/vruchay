import { describe, expect, it } from 'vitest';
import { SECTIONS } from './sections';
import { NAV_ITEMS, activeNav, parentPath, parentTitle } from './nav';

describe('заглушки разделов', () => {
  it('у каждой есть название и строка объяснения', () => {
    for (const s of SECTIONS) {
      expect(s.label).not.toBe('');
      expect(s.about).not.toBe('');
    }
  });

  it('адреса не повторяются', () => {
    const paths = SECTIONS.map((s) => s.path);
    expect(new Set(paths).size).toBe(paths.length);
  });
});

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

/*
 * Стрелка под шапкой ведёт на уровень выше, а не назад по истории.
 * Ошибка здесь — человек ходит кругами между материалом и письмом
 * или между корнем раздела и его редиректом.
 */
describe('стрелка на уровень выше', () => {
  it('из материала — к документам, из раздела — на главную', () => {
    expect(parentPath('/documents/8f0e6a0e-0f5b-4a1a-9c3a-2f2b1d4e5c6a')).toBe('/documents');
    expect(parentPath('/documents')).toBe('/');
    expect(parentPath('/mailing/8f0e6a0e')).toBe('/mailing');
    expect(parentPath('/documents/archive')).toBe('/documents');
  });

  it('сначала снимает отбор и вкладку, потом сегмент пути', () => {
    expect(parentPath('/registry', '?tab=analytics')).toBe('/registry');
    expect(parentPath('/registry', '?search=Иванова')).toBe('/registry');
    expect(parentPath('/registry', '')).toBe('/');
  });

  it('из площадки интеграций и вкладки настроек — сразу на главную: их корень редиректит', () => {
    expect(parentPath('/integrations/tilda')).toBe('/');
    expect(parentPath('/settings/account')).toBe('/');
    expect(parentPath('/settings/support')).toBe('/');
  });

  it('подсказка называет место назначения', () => {
    expect(parentTitle('/')).toBe('На главную');
    expect(parentTitle('/documents')).toBe('К документам');
    expect(parentTitle('/invoices')).toBe('На уровень выше');
  });
});
