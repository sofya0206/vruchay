import { describe, expect, it } from 'vitest';
import { fieldRegistry } from './fields';
import { fieldGroup, fieldIcon, matchesQuery } from './field-meta';

const fields = fieldRegistry([
  { id: 'c1', name: 'name' },
  { id: 'c2', name: 'email' },
  { id: 'c3', name: 'team' },
]);
const byKey = (key: string) => fields.find((f) => f.source === key)!;

describe('группы панели полей', () => {
  it('колонки таблицы и производные от ФИО — у получателей', () => {
    for (const key of ['name', 'team', 'name_dat', 'name_lat_gost', 'place_word']) {
      expect(fieldGroup(byKey(key)), key).toBe('recipient');
    }
  });

  it('сведения о мероприятии — отдельно от дат выдачи', () => {
    expect(fieldGroup(byKey('event_place'))).toBe('event');
    expect(fieldGroup(byKey('hours'))).toBe('event');
    expect(fieldGroup(byKey('date'))).toBe('document');
    expect(fieldGroup(byKey('code'))).toBe('document');
  });

  it('у каждого служебного поля есть группа из трёх известных', () => {
    for (const f of fields) expect(['recipient', 'event', 'document']).toContain(fieldGroup(f));
  });
});

describe('значки полей', () => {
  it('различают человека, почту, дату и номер', () => {
    expect(fieldIcon(byKey('name'))).toBe('person');
    expect(fieldIcon(byKey('name_short'))).toBe('person');
    expect(fieldIcon(byKey('email'))).toBe('email');
    expect(fieldIcon(byKey('date_long'))).toBe('date');
    expect(fieldIcon(byKey('reg_number'))).toBe('number');
    expect(fieldIcon(byKey('team'))).toBe('text');
  });
});

describe('поиск поля', () => {
  it('находит по названию, ключу и образцу значения', () => {
    expect(matchesQuery(byKey('name'), 'Иванов Пётр', 'фамил')).toBe(true);
    expect(matchesQuery(byKey('name'), 'Иванов Пётр', 'NAME')).toBe(true);
    expect(matchesQuery(byKey('name'), 'Иванов Пётр', 'иванов')).toBe(true);
    expect(matchesQuery(byKey('email'), undefined, 'иванов')).toBe(false);
  });

  it('пустой запрос пропускает всё', () => {
    expect(matchesQuery(byKey('team'), undefined, '   ')).toBe(true);
  });
});
