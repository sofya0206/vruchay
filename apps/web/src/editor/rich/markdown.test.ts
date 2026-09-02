import { describe, expect, it } from 'vitest';
import { mergeField, paragraph, textRun, type RichDoc } from '@gramota/shared';
import {
  looksLikeMarkdown,
  markdownToHtml,
  richDocToClipboardText,
  richDocToMarkdownLossy,
} from './markdown';

describe('markdown — мост', () => {
  it('узнаёт разметку и не путает с обычным текстом', () => {
    expect(looksLikeMarkdown('**Иванов** Пётр')).toBe(true);
    expect(looksLikeMarkdown('- первое\n- второе')).toBe(true);
    expect(looksLikeMarkdown('Награждается Иванов Пётр')).toBe(false);
    // Звёздочка в данных — не разметка.
    expect(looksLikeMarkdown('Иванов*')).toBe(false);
  });

  it('разбирает вставленное в HTML без ссылок и сырого HTML', () => {
    const html = markdownToHtml('**жирный** и <b>сырой</b> http://x.y');
    expect(html).toContain('<strong>жирный</strong>');
    expect(html).not.toContain('<b>');
    expect(html).not.toContain('<a ');
  });

  it('экспорт с потерями: марки без записи выпадают, поля — {{name}}', () => {
    const doc: RichDoc = {
      type: 'doc',
      content: [
        paragraph([
          textRun('Награждается '),
          mergeField('name'),
          textRun(' за '),
          textRun('победу', { type: 'bold' }, { type: 'textStyle', attrs: { color: '#ff0000' } }),
        ]),
        {
          type: 'bulletList',
          attrs: { marker: 'disc' },
          content: [
            { type: 'listItem', attrs: { checked: true }, content: [paragraph([textRun('пункт')])] },
          ],
        },
      ],
    };
    expect(richDocToMarkdownLossy(doc)).toBe('Награждается {{name}} за **победу**\n- [x] пункт');
    expect(richDocToClipboardText(doc)).toBe('Награждается {{name}} за победу\n- [x] пункт');
  });
});
