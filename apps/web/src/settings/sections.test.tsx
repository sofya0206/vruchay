import { describe, expect, it } from 'vitest';
import { SETTINGS_SECTIONS } from './sections';

/**
 * Адреса разделов — часть обещания: по ссылке из письма или из переписки
 * с поддержкой должен открыться именно нужный раздел. Переименование
 * пути ломает чужие закладки молча, поэтому список закреплён тестом.
 */
const REQUIRED = [
  'account',
  'organization',
  'domains',
  'senders',
  'team',
  'security',
  'interface',
  'privacy',
  'referral',
  'support',
];

describe('разделы настроек', () => {
  it('у каждого обязательного раздела есть свой адрес', () => {
    const paths = SETTINGS_SECTIONS.map((s) => s.path);
    for (const required of REQUIRED) expect(paths).toContain(required);
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
