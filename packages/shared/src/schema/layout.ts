import { z } from 'zod';
import {
  hrefFieldNames,
  isSafeHrefTemplate,
  richDoc,
  richDocFieldNames,
  richDocFromPlainText,
  richDocToPlainText,
  FONT_FAMILY_RE,
  type RichDoc,
} from './rich-text';

/**
 * Контракт макета листа документа.
 * Используется тремя потребителями: редактором (канва), превью и серверным
 * PDF-рендером — любые изменения формата проходят через schema_version листа.
 */

/*
 * Пределы на размер макета.
 *
 * Макет приходит с клиента и печатает его потом браузер воркера. Без пределов
 * единственным ограничением был общий предел тела запроса в мегабайт — а
 * мегабайт координат и текста складывается в страницу, которую Chromium будет
 * верстать минутами и в которой каждому выпускаемому документу достанется
 * своя копия. Числа выбраны с запасом к любому настоящему бланку: самые
 * плотные заготовки проекта — это десятки элементов, а не тысячи.
 *
 * Ограничения не меняют формат листа, поэтому schemaVersion не трогают:
 * прежде записанный макет читается ими без изменений.
 */
export const MAX_ELEMENTS_PER_SHEET = 500;
export const MAX_TEXT_LENGTH = 5_000;
/** Втрое больше самого длинного листа A0 — дальше уже не лист, а ошибка. */
export const MAX_COORDINATE_MM = 5_000;
export const MAX_FONT_SIZE_PT = 500;

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const elementBase = z.object({
  id: z.string().min(1).max(100),
  /** координаты и размеры в миллиметрах от левого верхнего угла листа */
  x: z.number().min(-MAX_COORDINATE_MM).max(MAX_COORDINATE_MM),
  y: z.number().min(-MAX_COORDINATE_MM).max(MAX_COORDINATE_MM),
  w: z.number().positive().max(MAX_COORDINATE_MM),
  h: z.number().positive().max(MAX_COORDINATE_MM),
  rotation: z.number().min(-360).max(360).default(0),
  z: z.number().int().min(-10_000).max(10_000).default(0),
  /** Прозрачность целиком: 1 — непрозрачный. */
  opacity: z.number().min(0).max(1).default(1),
  /**
   * Замок от случайного сдвига. Блок остаётся на листе и печатается,
   * но мышью его не подвинуть — только сняв замок в панели слоёв.
   */
  locked: z.boolean().default(false),
  /** Скрытый блок не печатается и не виден на холсте — но не удалён. */
  hidden: z.boolean().default(false),
  /** Группа: блоки с одним идентификатором двигаются вместе. */
  groupId: z.string().max(100).nullable().default(null),
  /** Название для панели слоёв; без него подпись берётся из содержимого. */
  name: z.string().max(100).nullable().default(null),
});

export const textAlign = z.enum(['left', 'center', 'right', 'justify']);
export const verticalAlign = z.enum(['top', 'middle', 'bottom']);

/*
 * Свойства текстового блока в двух видах: как их принимает разбор и как
 * их видит остальной код. Разница — в самом тексте.
 *
 * Раньше блок хранил `text: string` с «%name» внутри; теперь — дерево
 * `doc` (см. rich-text.ts). Уже сохранённые макеты продолжают приходить
 * в старом виде, и их никто не переписывает в базе: разбор принимает оба
 * и отдаёт всегда новый. Старый текст превращается в дерево на лету, тем
 * же способом, что и при явной миграции, — одна функция на оба случая.
 *
 * Стили блока (`fontFamily`, `bold` и остальные) остались на месте и по
 * тому же смыслу: это оформление всего блока по умолчанию, поверх которого
 * ложатся марки отдельных прогонов. Так старый макет печатается ровно как
 * печатался — у него нет ни одной марки, и всё берётся из блока.
 */
const textPropsInput = z.object({
    /** Прежний вид: строка с переменными «%name». Только на входе. */
    text: z.string().max(MAX_TEXT_LENGTH).optional(),
    /** Новый вид: дерево абзацев, прогонов и полей. */
    doc: richDoc.optional(),
    fontFamily: z.string().regex(FONT_FAMILY_RE).default('PT Sans'),
    /** размер шрифта в pt */
    fontSize: z.number().positive().max(MAX_FONT_SIZE_PT).default(16),
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .default('#000000'),
    align: textAlign.default('center'),
    verticalAlign: verticalAlign.default('middle'),
    lineHeight: z.number().positive().default(1.2),
    letterSpacing: z.number().default(0),
    bold: z.boolean().default(false),
    italic: z.boolean().default(false),
    underline: z.boolean().default(false),
    /**
     * ПРОПИСНЫЕ БУКВЫ — оформлением, а не правкой самого текста.
     * Важно для подстановки: фамилия приходит из таблицы как «Иванов»,
     * и переписывать её в верхний регистр вручную негде.
     */
    uppercase: z.boolean().default(false),
    /**
     * Обводка вокруг букв, в миллиметрах. Нужна, когда текст ложится
     * на пёстрый фон и без неё сливается.
     */
    strokeWidth: z.number().min(0).max(2).default(0),
    strokeColor: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .default('#ffffff'),
    /** уменьшать размер шрифта, чтобы текст влез в блок */
    autoFit: z.boolean().default(false),
    /** Отступ от краёв блока до текста, мм. */
    padding: z.number().min(0).max(50).default(0),
    /** Заливка блока; null — прозрачный. */
    background: hexColor.nullable().default(null),
    /** Рамка блока: толщина в мм, 0 — нет рамки. */
    borderWidth: z.number().min(0).max(5).default(0),
    borderColor: hexColor.default('#000000'),
    /** Мягкая тень под текстом — для светлого текста на светлом бланке. */
    shadow: z.boolean().default(false),
  });

export const textProps = textPropsInput
  .refine((p) => p.text !== undefined || p.doc !== undefined, {
    message: 'У текстового блока нет ни текста, ни дерева',
  })
  .transform(({ text, doc, ...rest }) => ({
    ...rest,
    doc: doc ?? richDocFromPlainText(text ?? ''),
  }))
  .refine((p) => richDocToPlainText(p.doc).length <= MAX_TEXT_LENGTH, {
    message: `Текст блока длиннее ${MAX_TEXT_LENGTH} символов`,
  });

export const textElement = elementBase.extend({
  type: z.literal('text'),
  props: textProps,
});

export const imageElement = elementBase.extend({
  type: z.literal('image'),
  props: z.object({
    fileId: z.string().uuid(),
  }),
});

export const qrElement = elementBase.extend({
  type: z.literal('qr'),
  props: z.object({
    /** шаблон содержимого QR; пустая строка = verify-URL файла */
    template: z.string().max(MAX_TEXT_LENGTH).default(''),
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .default('#000000'),
  }),
});

/**
 * Ссылка-область: невидимый прямоугольник поверх чего угодно — логотипа,
 * картинки, подписи. В PDF становится аннотацией, и она кликается.
 * Адрес — шаблон: в нём допустимы поля (`{{code}}`, `%site`), которые
 * подставляются при печати; `javascript:` и `data:` не проходят по той же
 * причине, что и раньше — адрес попадает в `href` печатаемой страницы.
 */
export const linkElement = elementBase.extend({
  type: z.literal('link'),
  props: z.object({
    url: z.string().max(2_000).refine(isSafeHrefTemplate, 'Ссылка должна начинаться с http:// или https://'),
  }),
});

/**
 * Фигура: линия, прямоугольник, овал. Рисуется векторно, в миллиметрах,
 * как и всё остальное на листе, — печать получает те же контуры, что холст.
 */
export const shapeElement = elementBase.extend({
  type: z.literal('shape'),
  props: z.object({
    kind: z.enum(['rect', 'ellipse', 'line']).default('rect'),
    /** Заливка; null — без заливки. */
    fill: hexColor.nullable().default(null),
    stroke: hexColor.default('#000000'),
    /** Толщина обводки в мм; 0 — без обводки. */
    strokeWidth: z.number().min(0).max(20).default(0.5),
    /** Скругление углов прямоугольника, мм. */
    radius: z.number().min(0).max(100).default(0),
    /** Пунктир: длина штриха в мм; 0 — сплошная. */
    dash: z.number().min(0).max(50).default(0),
  }),
});

export const sheetElement = z.discriminatedUnion('type', [
  textElement,
  imageElement,
  qrElement,
  linkElement,
  shapeElement,
]);

export const sheetLayout = z.array(sheetElement).max(MAX_ELEMENTS_PER_SHEET);

/**
 * Версия 2: текст блока — дерево `doc` вместо строки `text`.
 *
 * Хранимые макеты первой версии не переписываются: разбор принимает
 * обе версии и отдаёт вторую. Номер нужен тому, кто когда-нибудь решит
 * переписать базу разом, — и тестам, которые следят, что старый вид
 * по-прежнему читается.
 */
export const CURRENT_LAYOUT_SCHEMA_VERSION = 2;

export type SheetElement = z.infer<typeof sheetElement>;
export type TextElement = z.infer<typeof textElement>;
export type TextProps = TextElement['props'];
export type ShapeElement = z.infer<typeof shapeElement>;
export type SheetLayout = z.infer<typeof sheetLayout>;
export type { RichDoc };

/** Имена переменных: %name, %course_1 и т.п. (латиница/цифры/подчёркивание) */
export const VARIABLE_RE = /%([a-zA-Z][a-zA-Z0-9_]*)/g;

export function extractVariables(layout: SheetLayout): string[] {
  const vars = new Set<string>();
  for (const el of layout) {
    if (el.type === 'text') {
      for (const name of richDocFieldNames(el.props.doc)) vars.add(name);
    }
    if (el.type === 'qr' && el.props.template) {
      for (const m of el.props.template.matchAll(VARIABLE_RE)) vars.add(m[1]);
    }
    if (el.type === 'link') {
      for (const name of hrefFieldNames(el.props.url)) vars.add(name);
    }
  }
  return [...vars];
}

/**
 * Подстановка значений в текст макета.
 *
 * `onMissing` решает, что печатать вместо переменной, для которой значения
 * нет. На печати это пустая строка: незаполненная переменная обязана
 * исчезнуть, а не оставить на бумаге «%event». В редакторе — наоборот,
 * сам токен: пустое место на холсте человек читает как поломку макета,
 * а «%event» прямо говорит, чего не хватает и что искать в панели.
 */
export function substituteVariables(
  text: string,
  data: Record<string, string>,
  onMissing: (name: string) => string = () => '',
): string {
  return text.replace(VARIABLE_RE, (_all, name: string) => data[name] ?? onMissing(name));
}

/** Оставить переменную как есть — для холста редактора и миниатюр. */
export function keepVariable(name: string): string {
  return `%${name}`;
}
