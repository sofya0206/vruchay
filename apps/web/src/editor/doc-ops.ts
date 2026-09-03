import { mergeField, paragraph, textRun, type RichDoc, type RichInline } from '@gramota/shared';

/**
 * Правки дерева блока без живого редактора — когда блок не в правке,
 * а поле надо положить в него с панели или перетаскиванием.
 */

/** Добавить поле в конец последнего абзаца, через пробел, если нужен. */
export function appendField(doc: RichDoc, source: string, fieldId: string | null): RichDoc {
  const content = [...doc.content];
  const lastIndex = content.length - 1;
  const last = content[lastIndex];

  const node = mergeField(source, { fieldId });
  if (!last || last.type !== 'paragraph') {
    return { type: 'doc', content: [...content, paragraph([node])] };
  }

  const inline: RichInline[] = [...last.content];
  const tail = inline[inline.length - 1];
  if (tail && (tail.type === 'mergeField' || (tail.type === 'text' && !/\s$/.test(tail.text)))) {
    inline.push(textRun(' '));
  }
  inline.push(node);
  content[lastIndex] = { ...last, content: inline };
  return { type: 'doc', content };
}

/** Дерево из одного поля — для нового блока «сюда пойдёт имя». */
export function docWithField(source: string, fieldId: string | null): RichDoc {
  return { type: 'doc', content: [paragraph([mergeField(source, { fieldId })])] };
}
