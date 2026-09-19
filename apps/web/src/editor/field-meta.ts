import type { FieldInfo } from './fields';

/**
 * Как панель полей раскладывает поля: по секциям и семействам.
 *
 * Отдельно от разметки, чтобы проверять тестом.
 *
 * Служебных полей два десятка, и плоским списком они читались как
 * свалка: «Дата выдачи», «Дата выдачи словами», «…цифрами (ISO)»,
 * «…по-английски» — четыре строки про одну и ту же дату. Человек думает
 * «сюда пойдёт дата», а не «сюда пойдёт дата по-английски». Поэтому
 * в панели одно значение — одна строка, а вид записи (словами, падеж,
 * латиница) выбирается уже на листе, в настройках самой фишки, — как
 * формат ячейки в табличном редакторе.
 */

export type FieldGroup = 'recipient' | 'event' | 'document';

export type FieldIcon = 'text' | 'person' | 'email' | 'date' | 'number' | 'medal' | 'code' | 'org' | 'event' | 'place';

export const GROUP_TITLES: Record<FieldGroup, string> = {
  recipient: 'Получатели',
  event: 'Мероприятие',
  document: 'Документ',
};

export const GROUP_ORDER: FieldGroup[] = ['recipient', 'event', 'document'];

/** Одна запись значения: «словами», «кому», «латиницей». */
export interface FieldVariant {
  field: FieldInfo;
  /** Чем запись отличается от соседних. У единственной записи пусто. */
  label: string;
}

/** Строка панели: одно значение и все его записи, основная первой. */
export interface FieldEntry {
  id: string;
  title: string;
  icon: FieldIcon;
  group: FieldGroup;
  variants: FieldVariant[];
}

interface Family {
  id: string;
  title: string;
  icon: FieldIcon;
  group: FieldGroup;
  /** Ключ → подпись записи. Порядок — порядок в панели, первая — основная. */
  members: [string, string][];
}

const FAMILIES: Family[] = [
  {
    id: 'person',
    title: 'ФИО',
    icon: 'person',
    group: 'recipient',
    members: [
      ['name', 'как в таблице'],
      ['name_dat', 'кому'],
      ['name_gen', 'кого'],
      ['name_short', 'сокращённо'],
      ['name_lat_icao', 'латиницей, паспорт'],
      ['name_lat_gost', 'латиницей, ГОСТ'],
    ],
  },
  {
    id: 'place',
    title: 'Место',
    icon: 'medal',
    group: 'recipient',
    members: [
      ['place', 'цифрой'],
      ['place_word', 'словом'],
    ],
  },
  {
    id: 'hours',
    title: 'Объём часов',
    icon: 'number',
    group: 'event',
    members: [
      ['hours', 'числом'],
      ['hours_word', 'прописью'],
    ],
  },
  {
    id: 'issue-date',
    title: 'Дата выдачи',
    icon: 'date',
    group: 'document',
    members: [
      ['date', 'числами'],
      ['date_long', 'словами'],
      ['date_en', 'по-английски'],
      ['date_iso', 'ISO'],
      ['year', 'только год'],
    ],
  },
  {
    id: 'number',
    title: 'Номер',
    icon: 'number',
    group: 'document',
    members: [
      ['number', 'по списку'],
      ['total', 'всего в списке'],
      ['reg_number', 'регистрационный'],
    ],
  },
];

const EVENT_FIELDS = new Set(['event', 'event_date', 'event_place']);

function singleGroup(field: FieldInfo): FieldGroup {
  if (field.kind === 'column') return 'recipient';
  return EVENT_FIELDS.has(field.source) ? 'event' : 'document';
}

function singleIcon(field: FieldInfo): FieldIcon {
  const key = field.source;
  if (key === 'email') return 'email';
  if (field.kind === 'column') return 'text';
  if (key === 'valid_until' || key === 'event_date') return 'date';
  if (key === 'code') return 'code';
  if (key === 'org') return 'org';
  if (key === 'event') return 'event';
  if (key === 'event_place') return 'place';
  return 'text';
}

/**
 * Поля → строки панели.
 *
 * Семейство встаёт туда, где в списке стоял его первый член: колонка
 * «ФИО» остаётся первой в «Получателях», как в таблице. Название
 * семейства берём у основной записи — если колонку назвали «Участник»,
 * строка так и называется.
 */
export function fieldEntries(fields: FieldInfo[]): FieldEntry[] {
  const byKey = new Map(fields.map((f) => [f.source, f]));
  const familyOf = new Map<string, Family>();
  for (const family of FAMILIES) for (const [key] of family.members) familyOf.set(key, family);

  const entries: FieldEntry[] = [];
  const placed = new Set<string>();
  for (const field of fields) {
    const family = familyOf.get(field.source);
    if (!family) {
      entries.push({
        id: field.source,
        title: field.title,
        icon: singleIcon(field),
        group: singleGroup(field),
        variants: [{ field, label: '' }],
      });
      continue;
    }
    if (placed.has(family.id)) continue;
    placed.add(family.id);
    const variants = family.members
      .filter(([key]) => byKey.has(key))
      .map(([key, label]) => ({ field: byKey.get(key)!, label }));
    const main = byKey.get(family.members[0][0]);
    entries.push({
      id: family.id,
      title: main && main.kind === 'column' ? main.title : family.title,
      icon: family.icon,
      group: family.group,
      variants: variants.length === 1 ? [{ field: variants[0].field, label: '' }] : variants,
    });
  }
  return entries;
}

/** Поиск по названию, ключу и образцу: «иванов» находит ФИО. */
export function filterEntries(
  entries: FieldEntry[],
  samples: Record<string, string>,
  query: string,
): FieldEntry[] {
  const q = query.trim().toLocaleLowerCase('ru-RU');
  if (!q) return entries;
  const has = (s: string) => s.toLocaleLowerCase('ru-RU').includes(q);
  return entries.filter((entry) => {
    const main = entry.variants[0].field;
    return has(entry.title) || has(main.title) || has(main.source) || has(samples[main.source] ?? '');
  });
}

/**
 * Виды записи поля — для настроек фишки на листе.
 *
 * Только те, что есть в документе: без колонки «Место» нечего писать
 * словом. Одна запись — выбирать не из чего, и секции «Вид» не будет.
 */
export function fieldVariants(source: string, fields: FieldInfo[]): { title: string; variants: FieldVariant[] } | null {
  const family = FAMILIES.find((f) => f.members.some(([key]) => key === source));
  if (!family) return null;
  const byKey = new Map(fields.map((f) => [f.source, f]));
  const variants = family.members
    .filter(([key]) => byKey.has(key))
    .map(([key, label]) => ({ field: byKey.get(key)!, label }));
  if (variants.length < 2) return null;
  const main = byKey.get(family.members[0][0]);
  return { title: main && main.kind === 'column' ? main.title : family.title, variants };
}
