import { z } from 'zod';

/**
 * Контракт макета листа документа.
 * Используется тремя потребителями: редактором (канва), превью и серверным
 * PDF-рендером — любые изменения формата проходят через schema_version листа.
 */

export const elementBase = z.object({
  id: z.string().min(1),
  /** координаты и размеры в миллиметрах от левого верхнего угла листа */
  x: z.number(),
  y: z.number(),
  w: z.number().positive(),
  h: z.number().positive(),
  rotation: z.number().default(0),
  z: z.number().int().default(0),
});

export const textAlign = z.enum(['left', 'center', 'right']);

export const textElement = elementBase.extend({
  type: z.literal('text'),
  props: z.object({
    /** текст с переменными вида %name */
    text: z.string(),
    fontFamily: z.string().default('PT Sans'),
    /** размер шрифта в pt */
    fontSize: z.number().positive().default(16),
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
    template: z.string().default(''),
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

export const sheetLayout = z.array(sheetElement);

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

export function substituteVariables(text: string, data: Record<string, string>): string {
  return text.replace(VARIABLE_RE, (_all, name: string) => data[name] ?? '');
}
