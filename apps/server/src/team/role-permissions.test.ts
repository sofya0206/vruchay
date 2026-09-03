import { describe, expect, it } from 'vitest';
import { PERMISSIONS, ROLE_TITLE } from './role-permissions';

describe('таблица прав ролей', () => {
  it('у каждого права заданы все три роли и уникальный ключ', () => {
    const keys = new Set(PERMISSIONS.map((p) => p.key));
    expect(keys.size).toBe(PERMISSIONS.length);
    for (const p of PERMISSIONS) {
      expect(Object.keys(p.roles).sort()).toEqual(['admin', 'member', 'owner']);
      expect(p.title.length).toBeGreaterThan(5);
    }
  });

  it('владелец может всё, а сотрудник — строго меньше управляющего', () => {
    // Иначе таблица врёт: роли в сервисе вложены, а не пересекаются.
    for (const p of PERMISSIONS) {
      expect(p.roles.owner).toBe(true);
      if (p.roles.member) expect(p.roles.admin).toBe(true);
    }
    expect(PERMISSIONS.some((p) => p.roles.admin && !p.roles.member)).toBe(true);
    expect(PERMISSIONS.some((p) => p.roles.owner && !p.roles.admin)).toBe(true);
  });

  it('названия ролей — по-русски, как в журнале', () => {
    expect(ROLE_TITLE).toEqual({ owner: 'Владелец', admin: 'Управляющий', member: 'Сотрудник' });
  });
});
