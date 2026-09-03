import { resolvePairedForms, rowGender, type Gender } from '../paired-forms';
import { typographRu } from '../typography';
import {
  resolveHrefTemplate,
  type ListMarker,
  type ListNumbering,
  type MergeFieldNode,
  type RichAlign,
  type RichBlock,
  type RichDoc,
  type RichInline,
  type RichListItem,
  type RichMark,
} from './rich-text';

/**
 * Подстановка данных в дерево блока.
 *
 * Это единственное место, где поля превращаются в значения, и через него
 * обязаны идти оба потребителя: рендер (холст и печать) и измеритель
 * («влезет ли»). Иначе они разошлись бы на первом же правиле — скажем,
 * рендер убрал бы запятую после пустой должности, а измеритель посчитал
 * бы её ширину.
 *
 * На выходе не дерево, а плоский список строк-блоков с маркерами: вложенные
 * списки развёрнуты в отступы. Так печать и измерение работают с одним
 * и тем же простым видом, а вложенность остаётся заботой хранения.
 */

/** Чем закончилась подстановка поля. */
export type FieldState =
  /** Значение есть. */
  | 'ok'
  /** Колонка есть, значение пустое — напечатан запасной текст или пусто. */
  | 'empty'
  /** Такой колонки нет: скорее всего, её переименовали или удалили. */
  | 'unknown';

export interface ResolvedField {
  type: 'field';
  attrs: MergeFieldNode['attrs'];
  marks?: RichMark[];
  /** Что печатать на месте поля. */
  text: string;
  state: FieldState;
}

export type ResolvedInline =
  | { type: 'text'; text: string; marks?: RichMark[] }
  | ResolvedField
  | { type: 'break' };

export interface ResolvedBlock {
  /** Маркер списка перед текстом: «•», «1.», «☐». null у абзаца. */
  marker: string | null;
  align: RichAlign | null;
  /** Ступени отступа: свой абзацный плюс вложенность списка. */
  indent: number;
  content: ResolvedInline[];
}

export interface ResolveOptions {
  /** Значения: колонки строки и служебные переменные вместе. */
  data: Record<string, string>;
  /**
   * Какие ключи вообще существуют — колонки списка и служебные переменные.
   * Без него «нет колонки» и «колонка пустая» неразличимы: в данных строки
   * пустая колонка тоже отсутствует. Когда списка нет, различать нечего,
   * и любое отсутствующее значение считается пустым.
   */
  known?: ReadonlySet<string> | null;
  /**
   * Что делать с полем без значения.
   *
   * `blank` — печать: поле исчезает (или печатается запасной текст),
   * пустые строки схлопываются. `token` — холст: поле остаётся видимым
   * токеном, и ничего не схлопывается — человек должен видеть, что
   * в макете стоит, а не что от него осталось бы.
   */
  unfilled: 'blank' | 'token';
  /** Типографика подставленных значений. Включена всегда, кроме тестов измерителя. */
  typography?: boolean;
}

/** Разделитель между двумя полями — то, что убирается, если одно из них пусто. */
const SEPARATOR_RE = /^[\s,;:·•–—-]*$/u;

export function resolveRichDoc(doc: RichDoc, options: ResolveOptions): ResolvedBlock[] {
  const gender = rowGender(options.data);
  const out: ResolvedBlock[] = [];
  walkBlocks(doc.content, 0, out, options, gender);
  return out;
}

function walkBlocks(
  blocks: RichBlock[],
  depth: number,
  out: ResolvedBlock[],
  options: ResolveOptions,
  gender: Gender,
): void {
  for (const block of blocks) {
    if (block.type === 'paragraph') {
      const content = resolveInline(block.content, options, gender);
      // Строка из одних полей, оставшаяся без них, на печати исчезает.
      // Что считается «из одних полей» — в `collapsed`.
      if (options.unfilled === 'blank' && collapsed(block.content, content)) continue;
      out.push({
        marker: null,
        align: block.attrs.align ?? null,
        indent: block.attrs.indent + depth,
        content,
      });
      continue;
    }

    const items = block.content;
    let number = block.type === 'orderedList' ? block.attrs.start : 1;
    for (const item of items) {
      const marker =
        block.type === 'bulletList'
          ? bulletMarker(block.attrs.marker, item)
          : orderedMarker(block.attrs.numbering, number);
      number++;

      const before = out.length;
      walkBlocks(item.content, depth + 1, out, options, gender);
      // Маркер достаётся первой строке пункта; остальные висят под ней.
      if (out.length > before) out[before].marker = marker;
    }
  }
}

/**
 * Стала ли строка пустой после подстановки.
 *
 * Пустой считается строка, в которой были поля, все они пусты, а вокруг
 * остались одни разделители: «%position» или «%name, %position».
 * Строка с подписью — «Должность: %position» — остаётся: убирать слова,
 * которые человек набрал сам, правило не вправе; это уже условный блок,
 * следующая ступень. Строка, пустая с самого начала, тоже остаётся —
 * это отбивка.
 */
function collapsed(source: RichInline[], resolved: ResolvedInline[]): boolean {
  if (!source.some((n) => n.type === 'mergeField')) return false;
  return resolved.every(
    (n) => n.type === 'break' || (n.type === 'field' ? n.text === '' : SEPARATOR_RE.test(n.text)),
  );
}

function bulletMarker(marker: ListMarker, item: RichListItem): string {
  if (item.attrs.checked !== null) return item.attrs.checked ? '☑' : '☐';
  return { disc: '•', dash: '–', circle: '◦', square: '▪' }[marker];
}

/**
 * Русские буквы для нумерации — без ё, й, ъ, ы, ь: так нумеруют
 * в документах, и «й)» после «и)» выглядит опечаткой.
 */
const RUSSIAN_LETTERS = 'абвгдежзиклмнопрстуфхцчшщэюя';

function orderedMarker(numbering: ListNumbering, n: number): string {
  switch (numbering) {
    case 'decimal-dot':
      return `${n}.`;
    case 'decimal-paren':
      return `${n})`;
    case 'upper-roman':
      return `${roman(n)}.`;
    case 'lower-alpha':
      return `${alpha(n)})`;
  }
}

function roman(n: number): string {
  const table: [number, string][] = [
    [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
    [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
  ];
  let rest = n;
  let out = '';
  for (const [value, digit] of table) {
    while (rest >= value) {
      out += digit;
      rest -= value;
    }
  }
  return out;
}

/** 1 → «а», 28 → «аа»: после алфавита буквы удваиваются, как в Word. */
function alpha(n: number): string {
  const base = RUSSIAN_LETTERS.length;
  const letter = RUSSIAN_LETTERS[(n - 1) % base];
  const repeat = Math.floor((n - 1) / base) + 1;
  return letter.repeat(repeat);
}

function resolveInline(
  content: RichInline[],
  options: ResolveOptions,
  gender: Gender,
): ResolvedInline[] {
  const resolved: ResolvedInline[] = content.map((node) => {
    if (node.type === 'hardBreak') return { type: 'break' };
    if (node.type === 'text') {
      // Парные формы «награждён(а)» живут в тексте шаблона и раскрываются
      // по полу строки — так же, как раскрывались в плоском тексте.
      return {
        type: 'text',
        text: resolvePairedForms(node.text, gender),
        marks: resolveLinkMarks(node.marks, options),
      };
    }
    const field = resolveField(node, options);
    return { ...field, marks: resolveLinkMarks(field.marks, options) };
  });

  return options.unfilled === 'blank' ? smartSpace(resolved) : resolved;
}

/**
 * Что печатать вместо поля.
 *
 * Значение проходит типографику, запасной текст — нет: значение приехало
 * из чужой таблицы и его надо причесать, а запасной текст человек набрал
 * сам, глядя на лист, и он уже такой, каким должен быть.
 */
export function resolveField(node: MergeFieldNode, options: ResolveOptions): ResolvedField {
  const { source, fallback, format } = node.attrs;
  const raw = options.data[source];
  const base = { type: 'field' as const, attrs: node.attrs, marks: node.marks };

  if (raw !== undefined && raw !== '') {
    const value = options.typography === false ? raw : typographRu(raw);
    return { ...base, text: applyFormat(value, format), state: 'ok' };
  }

  const known = options.known ? options.known.has(source) : true;
  const state: FieldState = known ? 'empty' : 'unknown';

  if (fallback) return { ...base, text: applyFormat(fallback, format), state };
  return { ...base, text: options.unfilled === 'token' ? `%${source}` : '', state };
}

/**
 * Поля в адресе ссылки подставляются на печати; на холсте адрес остаётся
 * шаблоном — человек должен видеть, куда ссылка ведёт по замыслу.
 * Ссылка, которая после подстановки перестала быть адресом, снимается:
 * битая аннотация в PDF хуже, чем её отсутствие.
 */
function resolveLinkMarks(
  marks: RichMark[] | undefined,
  options: ResolveOptions,
): RichMark[] | undefined {
  if (!marks || options.unfilled === 'token') return marks;
  const out: RichMark[] = [];
  for (const mark of marks) {
    if (mark.type !== 'link') {
      out.push(mark);
      continue;
    }
    const href = resolveHrefTemplate(mark.attrs.href, options.data);
    if (href) out.push({ ...mark, attrs: { ...mark.attrs, href } });
  }
  return out.length ? out : undefined;
}

export function applyFormat(value: string, format: MergeFieldNode['attrs']['format']): string {
  switch (format) {
    case 'upper':
      return value.toLocaleUpperCase('ru-RU');
    case 'lower':
      return value.toLocaleLowerCase('ru-RU');
    case 'title':
      return value.replace(/(^|[\s\u00A0(«„-])(\p{L})/gu, (_all, before: string, letter: string) =>
        before + letter.toLocaleUpperCase('ru-RU'),
      );
    default:
      return value;
  }
}

/**
 * Умный разделитель: между двумя полями он живёт, только пока живы оба.
 *
 * «{{name}}, {{position}}» при пустой должности давал бы «Иванов, » —
 * с висящей запятой. Правило намеренно простое: убирается только текст,
 * стоящий строго между двумя полями и состоящий из одних знаков
 * препинания и пробелов. Условные блоки — отдельная, следующая ступень;
 * это правило её не заменяет, а закрывает самый частый случай.
 */
function smartSpace(content: ResolvedInline[]): ResolvedInline[] {
  const out: ResolvedInline[] = [];
  for (let i = 0; i < content.length; i++) {
    const node = content[i];
    if (node.type === 'text' && SEPARATOR_RE.test(node.text)) {
      const prev = content[i - 1];
      const next = content[i + 1];
      const between = prev?.type === 'field' && next?.type === 'field';
      if (between && (prev.text === '' || next.text === '')) continue;
    }
    out.push(node);
  }
  return out;
}

/** Текст блока после подстановки — без оформления, строки через перевод. */
export function resolvedPlainText(blocks: ResolvedBlock[]): string {
  return blocks
    .map((block) => {
      const body = block.content
        .map((n) => (n.type === 'break' ? '\n' : n.text))
        .join('');
      return block.marker ? `${block.marker} ${body}` : body;
    })
    .join('\n');
}
