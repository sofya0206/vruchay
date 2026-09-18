import type { FieldInfo } from './fields';

/**
 * Группы и значки полей — отдельно от разметки, чтобы проверять тестом.
 *
 * Служебных полей полтора десятка, и одним списком «Подставит сервис»
 * они читались как свалка: дата выдачи вперемешку с местом проведения.
 * Делим по тому, о чём поле: о человеке из таблицы, о мероприятии
 * или о самом документе.
 */

export type FieldGroup = 'recipient' | 'event' | 'document';

export type FieldIcon = 'text' | 'person' | 'email' | 'date' | 'number' | 'code' | 'org' | 'event' | 'place';

export const GROUP_TITLES: Record<FieldGroup, string> = {
  recipient: 'Получатели',
  event: 'Мероприятие',
  document: 'Документ',
};

export const GROUP_ORDER: FieldGroup[] = ['recipient', 'event', 'document'];

const EVENT_FIELDS = new Set(['event', 'event_date', 'event_place', 'hours', 'hours_word']);

/**
 * Служебные поля, которые на самом деле о получателе: ФИО в падежах
 * и латиницей, место словом. Их считает сервис, но человек ищет их
 * рядом с ФИО и местом, а не среди дат выдачи.
 */
const RECIPIENT_DERIVED = new Set(['name_dat', 'name_gen', 'name_short', 'name_lat_gost', 'name_lat_icao', 'place_word']);

export function fieldGroup(field: FieldInfo): FieldGroup {
  if (field.kind === 'column' || RECIPIENT_DERIVED.has(field.source)) return 'recipient';
  return EVENT_FIELDS.has(field.source) ? 'event' : 'document';
}

const PERSON_COLUMNS = new Set(['name', 'surname', 'firstname', 'patronymic', 'fio']);
const PERSON_DERIVED = new Set(['name_dat', 'name_gen', 'name_short', 'name_lat_gost', 'name_lat_icao']);

export function fieldIcon(field: FieldInfo): FieldIcon {
  const key = field.source;
  if (field.kind === 'column') {
    if (PERSON_COLUMNS.has(key)) return 'person';
    if (key === 'email') return 'email';
    return 'text';
  }
  if (PERSON_DERIVED.has(key)) return 'person';
  if (key.startsWith('date') || key === 'year' || key === 'valid_until' || key === 'event_date') return 'date';
  if (key === 'number' || key === 'total' || key === 'reg_number' || key === 'hours') return 'number';
  if (key === 'code') return 'code';
  if (key === 'org') return 'org';
  if (key === 'event') return 'event';
  if (key === 'event_place') return 'place';
  return 'text';
}

/** Поиск по названию, ключу и образцу значения: «иван» находит ФИО. */
export function matchesQuery(field: FieldInfo, sample: string | undefined, query: string): boolean {
  const q = query.trim().toLocaleLowerCase('ru-RU');
  if (!q) return true;
  return [field.title, field.source, sample ?? ''].some((s) => s.toLocaleLowerCase('ru-RU').includes(q));
}
