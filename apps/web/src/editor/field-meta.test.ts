import { describe, expect, it } from 'vitest';
import { fieldRegistry } from './fields';
import { fieldEntries, filterEntries } from './field-meta';

const fields = fieldRegistry([
  { id: 'c1', name: 'name' },
  { id: 'c2', name: 'email' },
  { id: 'c3', name: 'place' },
  { id: 'c4', name: 'team' },
]);
const entries = fieldEntries(fields);
const entry = (id: string) => entries.find((e) => e.id === id)!;

describe('строки панели полей', () => {
  it('записи одного значения собраны в одну строку', () => {
    expect(entry('person').variants.map((v) => v.field.source)).toEqual([
      'name',
      'name_dat',
      'name_gen',
      'name_short',
      'name_lat_icao',
      'name_lat_gost',
    ]);
    expect(entry('issue-date').variants.map((v) => v.label)).toEqual([
      'числами',
      'словами',
      'по-английски',
      'ISO',
      'только год',
    ]);
    expect(entry('place').variants).toHaveLength(2);
  });

  it('служебная запись не появляется отдельной строкой рядом со своим семейством', () => {
    const ids = entries.map((e) => e.id);
    for (const key of ['name_dat', 'date_long', 'date_iso', 'year', 'place_word', 'total']) {
      expect(ids, key).not.toContain(key);
    }
  });

  it('каждое поле попадает ровно в одну строку', () => {
    const placed = entries.flatMap((e) => e.variants.map((v) => v.field.source));
    expect(placed.sort()).toEqual(fields.map((f) => f.source).sort());
  });

  it('ФИО стоит первым у получателей, как колонка в таблице', () => {
    const recipients = entries.filter((e) => e.group === 'recipient').map((e) => e.id);
    expect(recipients).toEqual(['person', 'email', 'place', 'team']);
  });

  it('семейство называется так, как человек назвал колонку', () => {
    const titled = fieldEntries(fieldRegistry([{ id: 'c1', name: 'name' }]).map((f) =>
      f.source === 'name' ? { ...f, title: 'Участник' } : f,
    ));
    expect(titled.find((e) => e.id === 'person')!.title).toBe('Участник');
  });

  it('в письме, где только колонки, у ФИО одна запись и без подписи', () => {
    const columnsOnly = fieldEntries(fields.filter((f) => f.kind === 'column'));
    expect(columnsOnly.find((e) => e.id === 'person')!.variants).toEqual([
      { field: fields.find((f) => f.source === 'name'), label: '' },
    ]);
  });

  it('мероприятие и документ — разные секции', () => {
    expect(entry('event_place').group).toBe('event');
    expect(entry('hours').group).toBe('event');
    expect(entry('issue-date').group).toBe('document');
    expect(entry('code').group).toBe('document');
  });
});

describe('поиск поля', () => {
  const samples = { name: 'Иванов Пётр', name_dat: 'Иванову Петру', date_long: '18 сентября 2026 г.' };
  const ids = (q: string) => filterEntries(entries, samples, q).map((e) => e.id);

  it('находит строку по названию, записи, ключу и образцу значения', () => {
    expect(ids('фамил')).toContain('person');
    expect(ids('паспорт')).toContain('person');
    expect(ids('NAME_DAT')).toContain('person');
    expect(ids('иванову')).toContain('person');
    expect(ids('иванов')).not.toContain('email');
  });

  it('совпавшее название показывает все записи, совпавшая запись — только себя', () => {
    const byTitle = filterEntries(entries, samples, 'дата выдачи').find((e) => e.id === 'issue-date')!;
    expect(byTitle.variants).toHaveLength(5);
    const byVariant = filterEntries(entries, samples, 'дательн').find((e) => e.id === 'person')!;
    expect(byVariant.variants.map((v) => v.field.source)).toEqual(['name_dat']);
  });

  it('пустой запрос пропускает всё', () => {
    expect(filterEntries(entries, samples, '   ')).toBe(entries);
  });
});
