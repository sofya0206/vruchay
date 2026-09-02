import { z } from 'zod';

/**
 * Текст блока как дерево, а не как строка.
 *
 * До этого текст блока был одной строкой, а оформление — набором флагов
 * на весь блок целиком: полужирный либо весь, либо ничего. Выделить в имени
 * фамилию, поставить другой цвет одному слову или набрать сноску верхним
 * индексом было нечем.
 *
 * Формат хранения — дерево в том же виде, в каком его отдаёт ProseMirror
 * (`{type, attrs, content, marks}`). Это не подражание чужому формату,
 * а его прямое повторное использование: редактор на холсте — TipTap,
 * и совпадение форматов означает, что между хранилищем и редактором нет
 * преобразования, которое могло бы что-нибудь потерять.
 *
 * Markdown хранилищем не является нигде и никогда. Он нужен тремя местами
 * в редакторе — набор «**жирный**» на лету, разбор вставленного из чужого
 * редактора куска и «скопировать текст без оформления», — но обратный путь
 * из него неточен: пересекающиеся диапазоны в нём невыразимы, а фамилия
 * «Иванов*» или организация «АО «Звёздочка» (100%)» ломают его синтаксис.
 *
 * Пределы здесь не косметические. Дерево приходит с клиента, и печатает
 * его потом Chromium в воркере — по копии на каждый выпускаемый документ.
 */

/** Узлов в дереве одного блока. Самый плотный настоящий блок — это десятки. */
export const MAX_RICH_NODES = 1_000;
/** Глубина вложенности списков: дальше третьего уровня не идёт ни один бланк. */
export const MAX_RICH_DEPTH = 6;

/**
 * Гарнитура попадает в CSS-свойство `font-family`. React подставляет
 * значения стиля через CSSOM и разметку из них собрать нельзя, но список
 * гарнитур в редакторе всё равно закрытый — поэтому проверяем по белому
 * списку символов, а не «лишь бы строка».
 */
export const FONT_FAMILY_RE = /^[\p{L}\p{N} ',_-]{1,100}$/u;
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

/*
 * Оформление прогона текста.
 *
 * Марки, а не диапазоны Markdown: они свободно пересекаются. «Иванов
 * **Пётр _Ильич_**» в Markdown выразимо только потому, что вложено;
 * «полужирный со второго слова по четвёртое, курсив с третьего по пятое»
 * — уже нет, а в марках это два независимых прогона.
 */

const simpleMark = <T extends string>(type: T) => z.object({ type: z.literal(type) });

export const boldMark = simpleMark('bold');
export const italicMark = simpleMark('italic');
export const underlineMark = simpleMark('underline');
export const strikeMark = simpleMark('strike');
export const superscriptMark = simpleMark('superscript');
export const subscriptMark = simpleMark('subscript');

/**
 * Всё, что задаётся значением, а не переключателем, — одной маркой.
 *
 * Так же устроен `textStyle` в самом TipTap: цвет, гарнитура и кегль там
 * не отдельные марки, а атрибуты одной. Разводить их по разным маркам
 * означало бы держать на одном слове пять перекрывающихся марок вместо
 * одной и разбирать их порядок при слиянии.
 */
export const textStyleMark = z.object({
  type: z.literal('textStyle'),
  attrs: z
    .object({
      color: z.string().regex(HEX_COLOR_RE).nullish(),
      /** Заливка под буквами — маркер, а не фон блока. */
      background: z.string().regex(HEX_COLOR_RE).nullish(),
      fontFamily: z.string().regex(FONT_FAMILY_RE).nullish(),
      /** Кегль прогона в пунктах — абсолютный, как и кегль блока. */
      fontSize: z.number().positive().max(500).nullish(),
      /** Насыщенность 300–900: у наградных гарнитур их больше двух. */
      fontWeight: z.number().int().min(100).max(900).nullish(),
      /** Разрядка в пунктах. */
      letterSpacing: z.number().min(-20).max(100).nullish(),
      /** Межсловный интервал в пунктах. */
      wordSpacing: z.number().min(-20).max(100).nullish(),
      transform: z.enum(['uppercase', 'lowercase', 'smallcaps']).nullish(),
    })
    .default({}),
});

export const richMark = z.discriminatedUnion('type', [
  boldMark,
  italicMark,
  underlineMark,
  strikeMark,
  superscriptMark,
  subscriptMark,
  textStyleMark,
]);

export type RichMark = z.infer<typeof richMark>;

/** Сколько марок на один прогон: больше семи их просто не бывает. */
const marks = z.array(richMark).max(8).optional();

/**
 * Как показать подставленное значение.
 *
 * Регистр здесь оформлением, а не правкой данных: фамилия приходит из
 * таблицы как «Иванов», и переписывать её прописными в самой таблице негде.
 */
export const mergeFieldFormat = z.enum(['none', 'upper', 'lower', 'title']);
export type MergeFieldFormat = z.infer<typeof mergeFieldFormat>;

/**
 * Подставляемое поле — узел дерева, а не подстрока «%name» в тексте.
 *
 * Разница не в записи, а в том, что можно сломать. Подстроку человек
 * правит буквами: стёр процент — поле молча стало обычным текстом,
 * опечатался в имени — на грамоте напечаталось «%nmae». Узел правится
 * только целиком: половины у него не бывает ни при выделении мышью,
 * ни при нажатии Backspace.
 *
 * `fieldId` и `source` — разные вещи, и обе нужны:
 *
 *  — `source` это ключ, по которому значение достаётся из данных строки
 *    («name», «place», «event»). Им подставляет и рендер, и проверка списка;
 *  — `fieldId` это то, чем колонка остаётся при переименовании. Для колонки
 *    списка это её идентификатор в базе, для служебной переменной — её имя
 *    (служебные заводит сервис, и переименовать их пользователь не может).
 *
 * Без `fieldId` переименование колонки «name» в «ФИО» переносило значения
 * в строках и оставляло макет ссылаться на пропавшее имя — грамота
 * печаталась с пустым местом вместо фамилии. Теперь переименование
 * находит свои узлы по `fieldId` и правит в них `source`.
 *
 * У старых макетов, разобранных из «%name», `fieldId` нет: в момент разбора
 * идентификатора колонки взять неоткуда. Для них переименование ищет узлы
 * по прежнему имени — это ровно то, чем оно было раньше, но теперь оно
 * хотя бы доходит до макета.
 */
export const mergeFieldNode = z.object({
  type: z.literal('mergeField'),
  attrs: z.object({
    /** Ключ в данных строки: колонка списка или служебная переменная. */
    source: z
      .string()
      .min(1)
      .max(100)
      // Тот же алфавит, что у прежних «%name»: макеты и данные ходят
      // через JSON-ключи, и вольный текст в них ничего не даёт.
      .regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, 'Недопустимое имя поля'),
    /** Стабильный идентификатор колонки; null у полей из старых макетов. */
    fieldId: z.string().max(100).nullish(),
    /** Что напечатать, если значения нет. Задаётся человеком словами. */
    fallback: z.string().max(200).nullish(),
    format: mergeFieldFormat.default('none'),
  }),
  marks,
});

export const richTextNode = z.object({
  type: z.literal('text'),
  text: z.string().min(1).max(5_000),
  marks,
});

export const hardBreakNode = z.object({
  type: z.literal('hardBreak'),
  marks,
});

export const richInline = z.discriminatedUnion('type', [
  richTextNode,
  mergeFieldNode,
  hardBreakNode,
]);

export type RichTextNode = z.infer<typeof richTextNode>;
export type MergeFieldNode = z.infer<typeof mergeFieldNode>;
export type HardBreakNode = z.infer<typeof hardBreakNode>;
export type RichInline = z.infer<typeof richInline>;

export const richAlign = z.enum(['left', 'center', 'right', 'justify']);
export type RichAlign = z.infer<typeof richAlign>;

const inlineContent = z.array(richInline).max(MAX_RICH_NODES).default([]);

export const paragraphNode = z.object({
  type: z.literal('paragraph'),
  attrs: z
    .object({
      /** null — «как весь блок»: выравнивание блока остаётся умолчанием. */
      align: richAlign.nullish(),
      /** Отступ абзаца ступенями, как в текстовых редакторах. */
      indent: z.number().int().min(0).max(8).default(0),
    })
    .default({ indent: 0 }),
  content: inlineContent,
});

export type RichParagraph = z.infer<typeof paragraphNode>;

/**
 * Маркеры списка.
 *
 * Набор закрытый: маркер печатается на бумаге, и произвольный символ
 * из буфера обмена (эмодзи, символ отсутствующего в бланке шрифта)
 * превратился бы в квадрат в PDF — заметил бы это получатель.
 */
export const listMarker = z.enum(['disc', 'dash', 'circle', 'square']);
export type ListMarker = z.infer<typeof listMarker>;

/** Нумерация: арабские с точкой и со скобкой, римские, русские буквы. */
export const listNumbering = z.enum(['decimal-dot', 'decimal-paren', 'upper-roman', 'lower-alpha']);
export type ListNumbering = z.infer<typeof listNumbering>;

/*
 * Пункт списка содержит абзацы и вложенные списки, то есть ссылается сам
 * на себя. Рекурсия объявлена геттерами, а не через `z.lazy`: обёрнутая
 * в lazy схема перестаёт быть «различимой по полю», и разбор блока
 * по `type` (`z.discriminatedUnion`) её уже не принимает. Возвращаемый
 * тип у геттера проставлен руками — им и разрывается круг, который
 * иначе TypeScript вывести не может.
 */

export type RichListItem = {
  type: 'listItem';
  attrs: { checked: boolean | null };
  content: RichBlock[];
};

export type RichBulletList = {
  type: 'bulletList';
  attrs: { marker: ListMarker };
  content: RichListItem[];
};

export type RichOrderedList = {
  type: 'orderedList';
  attrs: { numbering: ListNumbering; start: number };
  content: RichListItem[];
};

export type RichBlock = RichParagraph | RichBulletList | RichOrderedList;

export const listItemNode = z.object({
  type: z.literal('listItem'),
  /** null — обычный пункт, true/false — пункт с квадратиком. */
  attrs: z.object({ checked: z.boolean().nullable().default(null) }).default({ checked: null }),
  get content(): z.ZodType<RichBlock[]> {
    return z.array(richBlock).max(MAX_RICH_NODES);
  },
});

export const bulletListNode = z.object({
  type: z.literal('bulletList'),
  attrs: z.object({ marker: listMarker.default('disc') }).default({ marker: 'disc' }),
  content: z.array(listItemNode).max(MAX_RICH_NODES),
});

export const orderedListNode = z.object({
  type: z.literal('orderedList'),
  attrs: z
    .object({
      numbering: listNumbering.default('decimal-dot'),
      start: z.number().int().min(1).max(9_999).default(1),
    })
    .default({ numbering: 'decimal-dot', start: 1 }),
  content: z.array(listItemNode).max(MAX_RICH_NODES),
});

export const richBlock = z.discriminatedUnion('type', [
  paragraphNode,
  bulletListNode,
  orderedListNode,
]) as unknown as z.ZodType<RichBlock>;

export type RichDoc = { type: 'doc'; content: RichBlock[] };

export const richDoc: z.ZodType<RichDoc> = z
  .object({
    type: z.literal('doc'),
    content: z.array(richBlock).max(MAX_RICH_NODES).default([]),
  })
  .superRefine((doc, ctx) => {
    const { nodes, depth } = measureTree(doc as RichDoc);
    if (nodes > MAX_RICH_NODES) {
      ctx.addIssue({ code: 'custom', message: `В блоке больше ${MAX_RICH_NODES} узлов` });
    }
    if (depth > MAX_RICH_DEPTH) {
      ctx.addIssue({ code: 'custom', message: `Списки вложены глубже ${MAX_RICH_DEPTH} уровней` });
    }
  }) as z.ZodType<RichDoc>;

/**
 * Размер дерева целиком.
 *
 * Пределы на каждый отдельный массив не ограничивают дерево: тысяча
 * абзацев по тысяче прогонов проходит поштучные проверки и складывается
 * в миллион узлов. Поэтому считаем один раз всё дерево.
 */
function measureTree(doc: RichDoc): { nodes: number; depth: number } {
  let nodes = 0;
  let depth = 0;

  const walkBlocks = (blocks: RichBlock[], level: number) => {
    depth = Math.max(depth, level);
    for (const block of blocks) {
      nodes++;
      if (block.type === 'paragraph') {
        nodes += block.content.length;
        continue;
      }
      for (const item of block.content) {
        nodes++;
        walkBlocks(item.content, level + 1);
      }
    }
  };

  walkBlocks(doc.content, 1);
  return { nodes, depth };
}

/* ─────────────────────────── сборка и разбор ─────────────────────────── */

export function emptyRichDoc(): RichDoc {
  return { type: 'doc', content: [] };
}

export function paragraph(content: RichInline[], attrs?: Partial<RichParagraph['attrs']>): RichParagraph {
  return { type: 'paragraph', attrs: { align: attrs?.align ?? null, indent: attrs?.indent ?? 0 }, content };
}

export function textRun(text: string, ...runMarks: RichMark[]): RichTextNode {
  return runMarks.length ? { type: 'text', text, marks: runMarks } : { type: 'text', text };
}

export function mergeField(
  source: string,
  attrs: Partial<Omit<MergeFieldNode['attrs'], 'source'>> = {},
): MergeFieldNode {
  return {
    type: 'mergeField',
    attrs: {
      source,
      fieldId: attrs.fieldId ?? null,
      fallback: attrs.fallback ?? null,
      format: attrs.format ?? 'none',
    },
  };
}

/** Имена переменных в прежней записи: %name, %course_1 и т.п. */
const LEGACY_VARIABLE_RE = /%([a-zA-Z][a-zA-Z0-9_]*)/g;

/**
 * Прежний плоский текст блока — деревом.
 *
 * Это и есть переход старых макетов на новый формат: одна строка с «%name»
 * внутри превращается в абзацы с узлами полей на тех же местах. Оформления
 * тут не появляется — весь блок по-прежнему набран одним стилем, и он
 * остаётся в свойствах блока, а не расходится по маркам. Так старый макет
 * печатается ровно так же, как печатался.
 */
export function richDocFromPlainText(text: string): RichDoc {
  const content: RichBlock[] = text.split('\n').map((line) => paragraph(inlineFromPlainText(line)));
  return { type: 'doc', content };
}

function inlineFromPlainText(line: string): RichInline[] {
  const out: RichInline[] = [];
  let last = 0;

  for (const match of line.matchAll(LEGACY_VARIABLE_RE)) {
    const at = match.index ?? 0;
    if (at > last) out.push(textRun(line.slice(last, at)));
    out.push(mergeField(match[1]));
    last = at + match[0].length;
  }

  if (last < line.length) out.push(textRun(line.slice(last)));
  return out;
}

/**
 * Текст блока без оформления — тем же способом, каким его читает человек.
 *
 * Поля печатаются прежней записью «%name»: этот вид нужен подсказкам
 * и экспорту «скопировать без оформления», где важно, что подставляется,
 * а не что подставилось.
 */
export function richDocToPlainText(doc: RichDoc): string {
  return blocksToLines(doc.content).join('\n');
}

function blocksToLines(blocks: RichBlock[]): string[] {
  const lines: string[] = [];
  for (const block of blocks) {
    if (block.type === 'paragraph') {
      lines.push(inlineToPlainText(block.content));
      continue;
    }
    for (const item of block.content) lines.push(...blocksToLines(item.content));
  }
  return lines;
}

function inlineToPlainText(content: RichInline[]): string {
  return content
    .map((node) =>
      node.type === 'text' ? node.text : node.type === 'mergeField' ? `%${node.attrs.source}` : '\n',
    )
    .join('');
}

/** Все поля дерева — в порядке появления, с повторами. */
export function richDocFields(doc: RichDoc): MergeFieldNode[] {
  const out: MergeFieldNode[] = [];
  walkInline(doc, (node) => {
    if (node.type === 'mergeField') out.push(node);
  });
  return out;
}

/** Имена, которые этот блок берёт из данных. */
export function richDocFieldNames(doc: RichDoc): string[] {
  return [...new Set(richDocFields(doc).map((f) => f.attrs.source))];
}

export function walkInline(doc: RichDoc, visit: (node: RichInline) => void): void {
  const blocks = (list: RichBlock[]) => {
    for (const block of list) {
      if (block.type === 'paragraph') {
        for (const node of block.content) visit(node);
        continue;
      }
      for (const item of block.content) blocks(item.content);
    }
  };
  blocks(doc.content);
}

/** Пустой ли блок: ни текста, ни полей. */
export function richDocIsEmpty(doc: RichDoc): boolean {
  let empty = true;
  walkInline(doc, (node) => {
    if (node.type === 'text' && node.text.trim() !== '') empty = false;
    if (node.type === 'mergeField') empty = false;
  });
  return empty;
}

/**
 * Заменить ключ поля во всём дереве.
 *
 * Нужно переименованию колонки: значения в строках оно переносит само,
 * а вот макеты до этой правки оставались ссылаться на исчезнувшее имя.
 * Ищем сначала по идентификатору колонки, а у старых макетов, где его
 * нет, — по прежнему имени.
 */
export function renameRichDocField(
  doc: RichDoc,
  from: { fieldId?: string | null; source: string },
  to: string,
): RichDoc {
  const matches = (attrs: MergeFieldNode['attrs']) =>
    from.fieldId && attrs.fieldId ? attrs.fieldId === from.fieldId : attrs.source === from.source;

  const mapInline = (content: RichInline[]): RichInline[] =>
    content.map((node) =>
      node.type === 'mergeField' && matches(node.attrs)
        ? { ...node, attrs: { ...node.attrs, source: to, fieldId: node.attrs.fieldId ?? from.fieldId ?? null } }
        : node,
    );

  const mapBlocks = (blocks: RichBlock[]): RichBlock[] =>
    blocks.map((block) =>
      block.type === 'paragraph'
        ? { ...block, content: mapInline(block.content) }
        : {
            ...block,
            content: block.content.map((item) => ({ ...item, content: mapBlocks(item.content) })),
          },
    );

  return { type: 'doc', content: mapBlocks(doc.content) };
}
