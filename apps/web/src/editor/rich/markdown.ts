import MarkdownIt from 'markdown-it';
import type { RichBlock, RichDoc, RichInline, RichMark } from '@gramota/shared';

/**
 * Markdown — мост, а не хранилище.
 *
 * Три роли, и только они: набор «**жирный**» на лету (это делают
 * правила ввода самого TipTap), разбор вставленного из чужого редактора
 * текста и «скопировать без оформления». Обратно из Markdown дерево
 * не собирается никогда: пересекающиеся марки в нём невыразимы,
 * а «Иванов*» или «АО «Звёздочка» (100%)» в данных ломают его синтаксис.
 * Поэтому экспорт здесь честно назван потерей: что нельзя выразить,
 * то выпадает, и это сказано в имени функции.
 */

const md = new MarkdownIt('commonmark', {
  // Ни HTML, ни автоссылок: вставленный текст — не место для разметки,
  // которую потом напечатает браузер.
  html: false,
  linkify: false,
  breaks: true,
});

/** Похоже ли на Markdown настолько, чтобы разбирать, а не вставлять как есть. */
export function looksLikeMarkdown(text: string): boolean {
  return /(\*\*|__|~~|^\s*[-*+]\s|^\s*\d+\.\s|(?<!\w)[*_][^*_\n]+[*_](?!\w))/m.test(text);
}

/**
 * Вставленный Markdown — в HTML, который поймёт разбор TipTap.
 *
 * Поля `{{name}}` переживают разбор отдельно: markdown-it их не знает
 * и оставил бы в тексте, а правило вставки TipTap потом превратит их
 * в узлы уже из готового HTML.
 */
export function markdownToHtml(text: string): string {
  return md.render(text);
}

/** Дерево — в Markdown с потерями: что невыразимо, то пропадает. */
export function richDocToMarkdownLossy(doc: RichDoc): string {
  return blocksToMarkdown(doc.content, 0).join('\n');
}

function blocksToMarkdown(blocks: RichBlock[], depth: number): string[] {
  const out: string[] = [];
  for (const block of blocks) {
    if (block.type === 'paragraph') {
      out.push('  '.repeat(depth) + inlineToMarkdown(block.content));
      continue;
    }
    let n = block.type === 'orderedList' ? block.attrs.start : 1;
    for (const item of block.content) {
      const marker =
        block.type === 'bulletList'
          ? item.attrs.checked === null
            ? '-'
            : item.attrs.checked
              ? '- [x]'
              : '- [ ]'
          : `${n++}.`;
      const lines = blocksToMarkdown(item.content, depth + 1);
      if (lines.length) lines[0] = '  '.repeat(depth) + `${marker} ${lines[0].trimStart()}`;
      out.push(...lines);
    }
  }
  return out;
}

function inlineToMarkdown(content: RichInline[]): string {
  return content
    .map((node) => {
      if (node.type === 'hardBreak') return '  \n';
      if (node.type === 'mergeField') return wrap(`{{${node.attrs.source}}}`, node.marks);
      return wrap(node.text, node.marks);
    })
    .join('');
}

/** Марки, у которых есть запись в Markdown; остальные — потеря. */
function wrap(text: string, marks: RichMark[] | undefined): string {
  if (!marks || !text) return text;
  let out = text;
  const has = (type: RichMark['type']) => marks.some((m) => m.type === type);
  if (has('bold')) out = `**${out}**`;
  if (has('italic')) out = `*${out}*`;
  if (has('strike')) out = `~~${out}~~`;
  return out;
}

/** Текст без оформления — то, что уходит в буфер по «скопировать текст». */
export function richDocToClipboardText(doc: RichDoc): string {
  return richDocToMarkdownLossy(doc)
    .replace(/\*\*|~~|(?<!\w)\*|\*(?!\w)/g, '')
    .replace(/ {2}\n/g, '\n');
}
