import { Extension, Mark, Node, mergeAttributes, nodePasteRule, wrappingInputRule } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Superscript from '@tiptap/extension-superscript';
import Subscript from '@tiptap/extension-subscript';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { FONT_FAMILY_RE, isSafeHrefTemplate, mergeFieldFormat, type RichMark } from '@gramota/shared';
import { markStyle } from '../../render/RichText';
import { MergeFieldView } from './MergeFieldView';

/**
 * Расширения TipTap — оболочка над схемой из packages/shared.
 *
 * Схема узлов и марок описана один раз, в `rich-text.ts`; здесь она
 * не переописывается, а повторяется в терминах TipTap: те же имена узлов,
 * те же атрибуты, те же умолчания. Так `editor.getJSON()` даёт ровно то
 * дерево, которое принимает `richDoc`, — без преобразования между ними
 * нечему потеряться. Тест `extensions.test.ts` это закрепляет.
 *
 * Оформление марок в живом редакторе берётся из той же функции, что
 * и на печати (`markStyle`): CSS одного прогона совпадает буквально,
 * и текст не «прыгает» при входе в правку и выходе из неё.
 */

/** CSS-объект React — в строку для атрибута style. */
function cssText(style: React.CSSProperties): string | null {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(style)) {
    if (value == null) continue;
    const prop = key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
    parts.push(`${prop}:${value}`);
  }
  return parts.length ? parts.join(';') : null;
}

/** Атрибут, который в разметку не попадает, если пуст. */
function attr<T>(defaultValue: T, dataName: string, parse?: (raw: string) => T) {
  return {
    default: defaultValue,
    parseHTML: (el: HTMLElement) => {
      const raw = el.getAttribute(dataName);
      if (raw == null) return defaultValue;
      return parse ? parse(raw) : (raw as unknown as T);
    },
    renderHTML: (attrs: Record<string, unknown>) => {
      const value = attrs[dataName.replace(/^data-/, '').replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase())];
      if (value == null || value === defaultValue) return {};
      return { [dataName]: String(value) };
    },
  };
}

const number = (raw: string) => Number(raw);

/**
 * Поле подстановки — атомарный строчный узел.
 *
 * `atom` и `selectable` дают большую часть поведения из требований силами
 * самого ProseMirror: стрелки перепрыгивают узел целиком, выделение мышью
 * захватывает его целиком, «половины» у него нет, узел можно перетащить.
 * Единственное, что дописано руками, — Backspace и Delete рядом с полем:
 * сами по себе они удалили бы его сразу, а требование — сначала выделить,
 * чтобы случайное нажатие не уносило поле молча.
 */
export const MergeField = Node.create({
  name: 'mergeField',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      source: { default: '', parseHTML: (el) => el.getAttribute('data-field') ?? '' },
      fieldId: attr<string | null>(null, 'data-field-id'),
      fallback: attr<string | null>(null, 'data-fallback'),
      format: attr<string>('none', 'data-format', (raw) =>
        mergeFieldFormat.safeParse(raw).success ? raw : 'none',
      ),
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-field]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-field': node.attrs.source,
        class: 'merge-chip chip-field',
        contenteditable: 'false',
      }),
      `%${node.attrs.source}`,
    ];
  },

  /** Ctrl+C в блокнот — `{{name}}`: так поле переживёт чужой редактор. */
  renderText({ node }) {
    return `{{${node.attrs.source}}}`;
  },

  addNodeView() {
    return ReactNodeViewRenderer(MergeFieldView);
  },

  /** Первое нажатие выделяет поле, второе (уже над выделением) удаляет. */
  addKeyboardShortcuts() {
    const selectNeighbour = (side: 'before' | 'after') => () => {
      const { selection } = this.editor.state;
      if (!selection.empty) return false;
      const $pos = selection.$from;
      const node = side === 'before' ? $pos.nodeBefore : $pos.nodeAfter;
      if (!node || node.type.name !== this.name) return false;
      const at = side === 'before' ? $pos.pos - node.nodeSize : $pos.pos;
      return this.editor.commands.setNodeSelection(at);
    };
    return {
      Backspace: selectNeighbour('before'),
      Delete: selectNeighbour('after'),
    };
  },

  /**
   * Вставка `{{name}}` и прежнего `%name` из буфера — сразу полем.
   * Второе — ради привычки: людям, размечавшим грамоты до этой правки,
   * пальцы ещё долго будут набирать процент.
   */
  addPasteRules() {
    return [
      nodePasteRule({
        find: /\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g,
        type: this.type,
        getAttributes: (match) => ({ source: match[1] }),
      }),
      nodePasteRule({
        find: /%([a-zA-Z][a-zA-Z0-9_]*)/g,
        type: this.type,
        getAttributes: (match) => ({ source: match[1] }),
      }),
    ];
  },
});

/** Абзац со своим выравниванием и отступом. */
export const Paragraph = Node.create({
  name: 'paragraph',
  group: 'block',
  content: 'inline*',
  priority: 1000,

  addAttributes() {
    return {
      align: attr<string | null>(null, 'data-align'),
      indent: attr<number>(0, 'data-indent', number),
    };
  },

  parseHTML() {
    return [{ tag: 'p' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const css = cssText({
      textAlign: node.attrs.align ?? undefined,
      paddingLeft: node.attrs.indent ? `${node.attrs.indent * 6}mm` : undefined,
    });
    return ['p', mergeAttributes(HTMLAttributes, css ? { style: css } : {}), 0];
  },

  addKeyboardShortcuts() {
    return {
      'Mod-Alt-0': () => this.editor.commands.setNode(this.name),
    };
  },
});

export const ListItem = Node.create({
  name: 'listItem',
  content: 'paragraph block*',
  defining: true,

  addAttributes() {
    return {
      checked: attr<boolean | null>(null, 'data-checked', (raw) => raw === 'true'),
    };
  },

  parseHTML() {
    return [{ tag: 'li' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'li',
      mergeAttributes(HTMLAttributes, node.attrs.checked !== null ? { 'data-task': node.attrs.checked ? 'done' : 'todo' } : {}),
      0,
    ];
  },

  addKeyboardShortcuts() {
    return {
      Enter: () => this.editor.commands.splitListItem(this.name),
      Tab: () => this.editor.commands.sinkListItem(this.name),
      'Shift-Tab': () => this.editor.commands.liftListItem(this.name),
    };
  },
});

export const BulletList = Node.create({
  name: 'bulletList',
  group: 'block list',
  content: 'listItem+',

  addAttributes() {
    return { marker: attr<string>('disc', 'data-marker') };
  },

  parseHTML() {
    return [{ tag: 'ul' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['ul', HTMLAttributes, 0];
  },

  addCommands() {
    return {
      toggleBulletList:
        () =>
        ({ commands }) =>
          commands.toggleList(this.name, 'listItem'),
    };
  },

  addKeyboardShortcuts() {
    return { 'Mod-Shift-8': () => this.editor.commands.toggleBulletList() };
  },

  /** «- » в начале строки — список, как в любом текстовом редакторе. */
  addInputRules() {
    return [wrappingInputRule({ find: /^\s*([-+*])\s$/, type: this.type })];
  },
});

export const OrderedList = Node.create({
  name: 'orderedList',
  group: 'block list',
  content: 'listItem+',

  addAttributes() {
    return {
      numbering: attr<string>('decimal-dot', 'data-numbering'),
      start: attr<number>(1, 'start', number),
    };
  },

  parseHTML() {
    return [{ tag: 'ol' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['ol', HTMLAttributes, 0];
  },

  addCommands() {
    return {
      toggleOrderedList:
        () =>
        ({ commands }) =>
          commands.toggleList(this.name, 'listItem'),
    };
  },

  addKeyboardShortcuts() {
    return { 'Mod-Shift-7': () => this.editor.commands.toggleOrderedList() };
  },

  /** «1. » в начале строки — нумерованный список с этого номера. */
  addInputRules() {
    return [
      wrappingInputRule({
        find: /^(\d+)\.\s$/,
        type: this.type,
        getAttributes: (match) => ({ start: Number(match[1]) || 1 }),
        joinPredicate: (match, node) => node.childCount + node.attrs.start === Number(match[1]),
      }),
    ];
  },
});

/**
 * Всё, что задаётся значением, — одной маркой `textStyle`, как в схеме.
 *
 * Оформление считает `markStyle` — та же функция, что и на печати.
 */
export const TextStyle = Mark.create({
  name: 'textStyle',

  addAttributes() {
    return {
      color: attr<string | null>(null, 'data-color'),
      background: attr<string | null>(null, 'data-background'),
      fontFamily: attr<string | null>(null, 'data-font-family', (raw) =>
        FONT_FAMILY_RE.test(raw) ? raw : null,
      ),
      fontSize: attr<number | null>(null, 'data-font-size', number),
      fontWeight: attr<number | null>(null, 'data-font-weight', number),
      letterSpacing: attr<number | null>(null, 'data-letter-spacing', number),
      wordSpacing: attr<number | null>(null, 'data-word-spacing', number),
      transform: attr<string | null>(null, 'data-transform'),
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-text-style]' }];
  },

  renderHTML({ mark, HTMLAttributes }) {
    const css = cssText(markStyle([{ type: 'textStyle', attrs: mark.attrs } as RichMark]));
    return ['span', mergeAttributes(HTMLAttributes, { 'data-text-style': '', style: css }), 0];
  },
});

/**
 * Ссылка — марка со своими атрибутами схемы: адрес-шаблон, подчёркивание,
 * цвет. Своя, а не из StarterKit: там атрибуты другие (`target`, `rel`),
 * и круг «схема → редактор → схема» их бы не пережил. Адрес проверяется
 * той же функцией, что и в схеме, — `javascript:` не пройдёт и здесь.
 */
export const Link = Mark.create({
  name: 'link',
  // Ссылка не «липнет» к набираемому дальше тексту: закончил слово — вышел из ссылки.
  inclusive: false,

  addAttributes() {
    return {
      href: {
        default: '',
        parseHTML: (el) => {
          const href = el.getAttribute('href') ?? '';
          return isSafeHrefTemplate(href) ? href : '';
        },
      },
      underline: attr<boolean>(true, 'data-underline', (raw) => raw !== 'false'),
      color: attr<string | null>(null, 'data-color'),
    };
  },

  parseHTML() {
    return [{ tag: 'a[href]' }];
  },

  renderHTML({ mark, HTMLAttributes }) {
    const css = cssText(markStyle([{ type: 'link', attrs: mark.attrs } as RichMark]));
    return [
      'a',
      mergeAttributes(HTMLAttributes, { href: mark.attrs.href, rel: 'noreferrer noopener', style: css }),
      0,
    ];
  },
});

/**
 * Неразрывный пробел и мягкий перенос — символами, а не узлами.
 *
 * Это обычные символы Unicode, печать понимает их без дополнительной
 * разметки. Расширение только даёт им клавиши.
 */
export const SpecialChars = Extension.create({
  name: 'specialChars',
  addKeyboardShortcuts() {
    return {
      'Mod-Shift-Space': () => this.editor.commands.insertContent(' '),
      'Mod--': () => this.editor.commands.insertContent('­'),
    };
  },
});

/**
 * Полный набор редактора.
 *
 * Из StarterKit выключено всё, чего нет в схеме листа: заголовки, цитаты,
 * код, ссылки, линейки. Списки и абзац — свои, с атрибутами схемы.
 * Отмена внутри блока остаётся у TipTap: пока блок правится, Ctrl+Z
 * откатывает буквы, а не весь лист.
 */
export function editorExtensions() {
  return [
    StarterKit.configure({
      heading: false,
      blockquote: false,
      code: false,
      codeBlock: false,
      horizontalRule: false,
      link: false,
      trailingNode: false,
      paragraph: false,
      bulletList: false,
      orderedList: false,
      listItem: false,
    }),
    Paragraph,
    ListItem,
    BulletList,
    OrderedList,
    TextStyle,
    Link,
    Superscript,
    Subscript,
    MergeField,
    SpecialChars,
  ];
}
