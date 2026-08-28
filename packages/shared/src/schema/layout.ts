import { z } from 'zod';

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

export const elementBase = z.object({
  id: z.string().min(1).max(100),
  /** координаты и размеры в миллиметрах от левого верхнего угла листа */
  x: z.number().min(-MAX_COORDINATE_MM).max(MAX_COORDINATE_MM),
  y: z.number().min(-MAX_COORDINATE_MM).max(MAX_COORDINATE_MM),
  w: z.number().positive().max(MAX_COORDINATE_MM),
  h: z.number().positive().max(MAX_COORDINATE_MM),
  rotation: z.number().min(-360).max(360).default(0),
  z: z.number().int().min(-10_000).max(10_000).default(0),
});

export const textAlign = z.enum(['left', 'center', 'right']);

export const textElement = elementBase.extend({
  type: z.literal('text'),
  props: z.object({
    /** текст с переменными вида %name */
    text: z.string().max(MAX_TEXT_LENGTH),
    fontFamily: z.string().max(100).default('PT Sans'),
    /** размер шрифта в pt */
    fontSize: z.number().positive().max(MAX_FONT_SIZE_PT).default(16),
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .default('#000000'),
    align: textAlign.default('center'),
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
  }),
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

export const linkElement = elementBase.extend({
  type: z.literal('link'),
  props: z.object({
    // Только http и https: z.string().url() пропускает javascript: и data:,
    // а ссылка попадает в href на странице, которую печатает браузер.
    url: z
      .string()
      .max(2_000)
      .url()
      .refine((v) => /^https?:\/\//i.test(v), 'Ссылка должна начинаться с http:// или https://'),
  }),
});

export const sheetElement = z.discriminatedUnion('type', [
  textElement,
  imageElement,
  qrElement,
  linkElement,
]);

export const sheetLayout = z.array(sheetElement).max(MAX_ELEMENTS_PER_SHEET);

export const CURRENT_LAYOUT_SCHEMA_VERSION = 1;

export type SheetElement = z.infer<typeof sheetElement>;
export type TextElement = z.infer<typeof textElement>;
export type SheetLayout = z.infer<typeof sheetLayout>;

/** Имена переменных: %name, %course_1 и т.п. (латиница/цифры/подчёркивание) */
export const VARIABLE_RE = /%([a-zA-Z][a-zA-Z0-9_]*)/g;

export function extractVariables(layout: SheetLayout): string[] {
  const vars = new Set<string>();
  for (const el of layout) {
    if (el.type === 'text') {
      for (const m of el.props.text.matchAll(VARIABLE_RE)) vars.add(m[1]);
    }
    if (el.type === 'qr' && el.props.template) {
      for (const m of el.props.template.matchAll(VARIABLE_RE)) vars.add(m[1]);
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
