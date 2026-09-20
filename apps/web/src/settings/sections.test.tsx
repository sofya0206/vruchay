import { describe, expect, it } from 'vitest';
import { SETTINGS_SECTIONS } from './sections';

/**
 * Адреса разделов — часть обещания: по ссылке из письма или из переписки
 * с поддержкой должен открыться именно нужный раздел. Переименование
 * пути ломает чужие закладки молча, поэтому список закреплён тестом.
 * Прежние адреса (domains, senders, privacy, tokens, support, referral)
 * ведут в новые места — см. shell/redirects.test.ts.
 */
const REQUIRED = ['account', 'interface', 'security', 'organization', 'team', 'mail', 'billing', 'integrations', 'audit'];

describe('разделы настроек', () => {
  it('ровно девять разделов, и у каждого свой адрес', () => {
    const paths = SETTINGS_SECTIONS.map((s) => s.path);
    expect(paths).toEqual(REQUIRED);
  });

  it('адреса не повторяются', () => {
    const paths = SETTINGS_SECTIONS.map((s) => s.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('у каждого раздела есть название и содержимое', () => {
    for (const section of SETTINGS_SECTIONS) {
      expect(section.title.length).toBeGreaterThan(2);
      expect(section.element).toBeTruthy();
    }
  });
});
