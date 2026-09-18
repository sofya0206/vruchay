import {
  renameRichDocField,
  richDocFieldNames,
  SYSTEM_VARIABLES,
  transliterateGost,
  type SheetLayout,
} from '@gramota/shared';

/**
 * Поля, которые можно подставить в документ: колонки списка и то, что
 * подставляет сервис.
 *
 * Слово «переменная» здесь и в интерфейсе не используется: человек, который
 * размечает грамоту, думает «сюда пойдёт имя», а не «вставлю переменную».
 * Поле называется по смыслу — «Имя», «Дата выпуска», — а ключ
 * («name», «date») остаётся служебным и виден только там, где без него
 * никак: в подсказке пропавшей колонки.
 */

export interface FieldInfo {
  /** Ключ в данных строки — то, что хранится в узле поля. */
  source: string;
  /** Идентификатор колонки в базе; у служебных полей его нет. */
  fieldId: string | null;
  /** Как назвать человеку. */
  title: string;
  /** Откуда берётся — одной строкой. */
  hint: string;
  kind: 'column' | 'system';
}

export interface ColumnInfo {
  id: string;
  name: string;
}

/** Колонки, которые сервис называет по-своему, а не именем ключа. */
const KNOWN_COLUMN_TITLES: Record<string, string> = {
  name: 'Фамилия и имя',
  email: 'Почта',
  place: 'Место',
  team: 'Команда',
  position: 'Должность',
  city: 'Город',
};

export function fieldRegistry(columns: ColumnInfo[]): FieldInfo[] {
  const own: FieldInfo[] = columns.map((c) => ({
    source: c.name,
    fieldId: c.id,
    title: KNOWN_COLUMN_TITLES[c.name] ?? c.name,
    hint: 'из таблицы',
    kind: 'column',
  }));
  const system: FieldInfo[] = SYSTEM_VARIABLES.filter(
    (v) => !columns.some((c) => c.name === v.name),
  ).map((v) => ({
    source: v.name,
    fieldId: null,
    title: v.title,
    hint: v.hint,
    kind: 'system',
  }));
  return [...own, ...system];
}

/** Ключи, которые существуют, — чтобы отличить пустую колонку от пропавшей. */
export function knownFieldKeys(columns: ColumnInfo[]): Set<string> {
  return new Set([...columns.map((c) => c.name), ...SYSTEM_VARIABLES.map((v) => v.name)]);
}

/** Подписи фишек: ключ → название. */
export function fieldLabels(fields: FieldInfo[]): Record<string, string> {
  return Object.fromEntries(fields.map((f) => [f.source, f.title]));
}

/*
 * Автосопоставление: макет ждёт «fio», в таблице — «ФИО». Или макет
 * ждёт «name», а колонку переименовали в «Участник». Это самый частый
 * способ сломать шаблон, и чинить его руками — значит знать про ключи.
 *
 * Сравниваем не буквы, а смысл: приводим оба имени к одному виду
 * (строчные, без ё, без пробелов и подчёркиваний), считаем синонимами
 * то, что в наградных таблицах означает одно и то же, и терпим две
 * опечатки. Порог в две правки взят из практики импорта: «фамилия»
 * и «фамилиия» — одно, «место» и «тесто» — уже нет (три).
 */

const SYNONYMS: string[][] = [
  ['фио', 'ф.и.о.', 'имя', 'name', 'участник', 'получатель', 'фамилия', 'фамилияимя', 'fio'],
  ['почта', 'email', 'e-mail', 'mail', 'адрес'],
  ['место', 'place', 'позиция', 'результат'],
  ['команда', 'team', 'клуб', 'организация', 'школа'],
  ['должность', 'position', 'роль'],
  ['город', 'city', 'населённыйпункт'],
  ['дата', 'date', 'датавыдачи'],
  ['номер', 'number', '№', 'nomer'],
];

/**
 * Одна форма для сравнения: строчные, без ё, без пробелов и подчёркиваний —
 * и латиницей. Транслитерация нужна не для красоты: импорт подбирает
 * ключи колонок латиницей по кириллическим заголовкам («Место» → «mesto»),
 * и поле макета с таким ключом обязано находить свою колонку.
 */
export function normalizeFieldName(name: string): string {
  return transliterateGost(name.replace(/ё/gi, 'е'))
    .toLocaleLowerCase('ru-RU')
    .replace(/[\s_\-.']+/g, '');
}

function synonymGroup(normalized: string): string[] | null {
  return SYNONYMS.find((group) => group.some((s) => normalizeFieldName(s) === normalized)) ?? null;
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_v, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let last = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const current = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, last + (a[i - 1] === b[j - 1] ? 0 : 1));
      last = current;
    }
  }
  return prev[b.length];
}

export const MAX_TYPO_DISTANCE = 2;

/** Самая похожая колонка на ключ поля — или null, если похожих нет. */
export function bestMatch(source: string, columns: ColumnInfo[]): ColumnInfo | null {
  const wanted = normalizeFieldName(source);
  const group = synonymGroup(wanted);

  let best: { column: ColumnInfo; score: number } | null = null;
  for (const column of columns) {
    const candidate = normalizeFieldName(column.name);
    let score: number;
    if (candidate === wanted) score = 0;
    else if (group && group.some((s) => normalizeFieldName(s) === candidate)) score = 1;
    else {
      const distance = levenshtein(wanted, candidate);
      if (distance > MAX_TYPO_DISTANCE) continue;
      score = 2 + distance;
    }
    if (!best || score < best.score) best = { column, score };
  }
  return best?.column ?? null;
}

export interface FieldMatch {
  from: string;
  to: ColumnInfo;
}

/**
 * Что можно переназначить автоматически: пропавшие поля макета → колонки.
 *
 * Только пропавшие: поле, у которого колонка есть, трогать нельзя,
 * даже если рядом есть похожая — человек его так и задумал.
 */
export function proposeMatches(layout: SheetLayout, columns: ColumnInfo[]): FieldMatch[] {
  const known = knownFieldKeys(columns);
  const used = new Set<string>();
  for (const el of layout) {
    if (el.type === 'text') for (const name of richDocFieldNames(el.props.doc)) used.add(name);
  }

  const matches: FieldMatch[] = [];
  const taken = new Set<string>();
  for (const source of used) {
    if (known.has(source)) continue;
    const column = bestMatch(source, columns.filter((c) => !taken.has(c.name)));
    if (!column) continue;
    taken.add(column.name);
    matches.push({ from: source, to: column });
  }
  return matches;
}

/** Применить сопоставление ко всему листу. */
export function applyMatches(layout: SheetLayout, matches: FieldMatch[]): SheetLayout {
  if (!matches.length) return layout;
  return layout.map((el) => {
    if (el.type !== 'text') return el;
    let doc = el.props.doc;
    for (const m of matches) {
      doc = renameRichDocField(doc, { fieldId: m.to.id, source: m.from }, m.to.name);
    }
    return { ...el, props: { ...el.props, doc } };
  });
}

/** Поле из только что заведённой колонки — чтобы сразу вставить его. */
export function fieldFromColumn(column: { id: string; name: string; title?: string | null }): FieldInfo {
  return {
    source: column.name,
    fieldId: column.id,
    title: column.title?.trim() || KNOWN_COLUMN_TITLES[column.name] || column.name,
    hint: 'из таблицы',
    kind: 'column',
  };
}
