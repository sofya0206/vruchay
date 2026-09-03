import type { RichMark } from '../schema/rich-text';
import type { ResolvedBlock } from '../schema/rich-text-resolve';
import type { StyledRun, TextStyle } from './measure';

/**
 * Из подставленных строк блока — прогоны для измерителя.
 *
 * Здесь марки превращаются в начертание: полужирная марка — в полужирный
 * прогон, `textStyle` с кеглем — в прогон своего кегля. Это единственное
 * место, где измеритель узнаёт о марках; сам он про них не знает и мерит
 * прогоны как есть.
 *
 * Правила подобраны так, чтобы ошибаться в сторону «шире»: капитель
 * меряется прописными (настоящая капитель у́же), а насыщенность от 600
 * считается полужирной (настоящая 600 у́же 700). Заниженная ширина — это
 * «сказали, что влезет», а обрезало, и заметит это получатель.
 */

/** Кегль верхнего и нижнего индекса относительно строки — `font-size: smaller`. */
const INDEX_SCALE = 1 / 1.2;

/** С этой насыщенности начертание берётся полужирное. */
const BOLD_FROM = 600;

/**
 * Начертание прогона: стиль блока, поправленный марками.
 *
 * Возвращает тот же объект для тех же марок — измеритель узнаёт соседние
 * прогоны одного стиля по ссылке и склеивает их, а не сравнивает поля.
 */
export function styleWithMarks(
  base: TextStyle,
  marks: RichMark[] | undefined,
  cache: Map<string, TextStyle>,
): TextStyle {
  if (!marks || marks.length === 0) return base;
  const key = JSON.stringify(marks);
  const known = cache.get(key);
  if (known) return known;

  const style: TextStyle = { ...base };
  for (const mark of marks) {
    switch (mark.type) {
      case 'bold':
        style.bold = true;
        break;
      case 'italic':
        style.italic = true;
        break;
      case 'superscript':
      case 'subscript':
        style.fontSize = style.fontSize * INDEX_SCALE;
        break;
      case 'textStyle': {
        const a = mark.attrs;
        if (a.fontFamily) style.fontFamily = a.fontFamily;
        if (a.fontSize) style.fontSize = a.fontSize;
        if (a.fontWeight != null) style.bold = a.fontWeight >= BOLD_FROM;
        if (a.letterSpacing != null) style.letterSpacing = a.letterSpacing;
        if (a.wordSpacing != null) style.wordSpacing = a.wordSpacing;
        if (a.transform === 'uppercase' || a.transform === 'smallcaps') style.uppercase = true;
        if (a.transform === 'lowercase') style.uppercase = false;
        break;
      }
      default:
        // underline, strike: на ширину не влияют.
        break;
    }
  }

  cache.set(key, style);
  return style;
}

/** Строчные — единственное преобразование, которого нет в самом стиле. */
function lowercased(marks: RichMark[] | undefined): boolean {
  return Boolean(
    marks?.some((m) => m.type === 'textStyle' && m.attrs.transform === 'lowercase'),
  );
}

/**
 * Прогоны всего блока: строки через перевод строки, маркер списка —
 * в начале своей строки тем же стилем, что и блок.
 *
 * Отступ списка в ширину не входит: измеритель считает строку от края
 * до края блока. Списки на наградных документах — редкость, а завышать
 * доступную ширину на глубину отступа безопасно: это ошибка в сторону
 * «не влезет», то есть лишнего предупреждения.
 */
export function runsOfBlocks(blocks: ResolvedBlock[], base: TextStyle): StyledRun[] {
  const cache = new Map<string, TextStyle>();
  const runs: StyledRun[] = [];

  blocks.forEach((block, index) => {
    if (index > 0) runs.push({ text: '\n', style: base });
    if (block.marker) runs.push({ text: `${block.marker} `, style: base });

    for (const node of block.content) {
      if (node.type === 'break') {
        runs.push({ text: '\n', style: base });
        continue;
      }
      if (node.text === '') continue;
      const text = lowercased(node.marks) ? node.text.toLocaleLowerCase('ru-RU') : node.text;
      runs.push({ text, style: styleWithMarks(base, node.marks, cache) });
    }
  });

  return runs;
}

/** Текст прогонов подряд — для сообщений и ключей кэша. */
export function runsText(runs: StyledRun[]): string {
  return runs.map((r) => r.text).join('');
}
