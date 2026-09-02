import {
  resolveRichDoc,
  richDocFieldNames,
  type RichDoc,
  type SheetLayout,
  type TextElement,
} from '@gramota/shared';
import {
  fitRuns,
  resolveFace,
  runsOfBlocks,
  runsText,
  type FitResult,
  type StyledRun,
  type TextStyle,
} from '@gramota/shared/fonts';

/**
 * Влезает ли подставленный текст в свой блок.
 *
 * Между макетом и измерением стоит этот файл: он превращает элемент листа
 * в описание начертания и коробку в миллиметрах, а всю арифметику отдаёт
 * общему пакету. Здесь же живёт кэш — на десяти тысячах строк один и тот же
 * текст встречается сотнями (у всех участников одинаковое «Награждается»),
 * и мерить его заново каждый раз незачем.
 */

export interface FitTarget {
  /** Идентификатор блока в макете — по нему человек найдёт его в редакторе. */
  elementId: string;
  /** Номер листа, считая с единицы: в документе их бывает несколько. */
  sheetNumber: number;
  /** Дерево блока с полями, как оно записано в макете. */
  doc: RichDoc;
  /** Начертание блока целиком — то, поверх чего ложатся марки прогонов. */
  style: TextStyle;
  box: { w: number; h: number };
  autoFit: boolean;
  /** Начертание подобрано неточно — измерение приблизительное. */
  substitutedFace: boolean;
  /** Переменные, которые подставляются в этот блок. */
  variables: string[];
}

/**
 * Коробка, доступная тексту: рамка и внутренний отступ отнимают у блока
 * место с каждой стороны — ровно так же, как на печати (box-sizing: border-box).
 */
function innerBox(element: TextElement): { w: number; h: number } {
  const inset = 2 * (element.props.padding + element.props.borderWidth);
  return { w: Math.max(element.w - inset, 0.1), h: Math.max(element.h - inset, 0.1) };
}

function styleOf(element: TextElement): TextStyle {
  const p = element.props;
  return {
    fontFamily: p.fontFamily,
    fontSize: p.fontSize,
    bold: p.bold,
    italic: p.italic,
    lineHeight: p.lineHeight,
    letterSpacing: p.letterSpacing,
    uppercase: p.uppercase,
    strokeWidth: p.strokeWidth,
  };
}

/**
 * Текстовые блоки всех листов документа.
 *
 * Блоки без переменных пропускаем: их текст одинаков во всех строках,
 * и если он не влезает — это беда макета, а не списка. О ней сообщает
 * отдельная проверка, а не десять тысяч одинаковых предупреждений.
 */
export function fitTargets(sheets: SheetLayout[]): FitTarget[] {
  const targets: FitTarget[] = [];

  sheets.forEach((layout, index) => {
    for (const element of layout) {
      if (element.type !== 'text') continue;

      const variables = richDocFieldNames(element.props.doc);
      if (!variables.length) continue;

      const style = styleOf(element);
      targets.push({
        elementId: element.id,
        sheetNumber: index + 1,
        doc: element.props.doc,
        style,
        box: innerBox(element),
        autoFit: element.props.autoFit,
        substitutedFace: resolveFace(style).substituted,
        variables,
      });
    }
  });

  return targets;
}

/**
 * Блоки без переменных, которые не влезают сами по себе.
 *
 * Это ошибка вёрстки: она одинакова для всех получателей и чинится один раз
 * в редакторе. Отдельно от строк, чтобы не повторять её в каждой.
 */
export function staticOverflows(sheets: SheetLayout[]): { elementId: string; text: string; sheetNumber: number }[] {
  const out: { elementId: string; text: string; sheetNumber: number }[] = [];

  sheets.forEach((layout, index) => {
    for (const element of layout) {
      if (element.type !== 'text') continue;
      if (richDocFieldNames(element.props.doc).length) continue;

      const style = styleOf(element);
      const runs = runsOfBlocks(
        resolveRichDoc(element.props.doc, { data: {}, unfilled: 'blank' }),
        style,
      );
      const text = runsText(runs);
      if (!text.trim()) continue;

      const result = fitRuns(runs, style, innerBox(element), element.props.autoFit);
      if (!result.fits) {
        out.push({ elementId: element.id, text, sheetNumber: index + 1 });
      }
    }
  });

  return out;
}

/** Блок с подставленными данными одной строки — прогонами и текстом. */
export interface RenderedTarget {
  runs: StyledRun[];
  /** Тот же текст подряд — для сообщений человеку. */
  text: string;
  /**
   * Ключ кэша: границы прогонов внутри текста.
   *
   * Одного текста мало: «Иванов» с полужирной фамилией и «Иванов» обычный
   * это один текст и разная ширина. Границы прогонов зависят от того,
   * какое поле что подставило, а не только от букв подряд.
   */
  key: string;
}

/**
 * Измеритель с памятью.
 *
 * Ключ — подставленный текст с границами прогонов, вместе с блоком:
 * у одного блока стиль и размеры постоянны, поэтому одинаковый текст
 * даёт одинаковый ответ. На списке в десять тысяч человек это снимает
 * большую часть работы: различаются только имена, а всё вокруг них
 * повторяется дословно.
 */
export class FitCache {
  private readonly memo = new Map<string, FitResult>();

  measure(target: FitTarget, rendered: RenderedTarget): FitResult {
    const key = `${target.elementId} ${rendered.key}`;
    const known = this.memo.get(key);
    if (known) return known;

    const result = fitRuns(rendered.runs, target.style, target.box, target.autoFit);
    this.memo.set(key, result);
    return result;
  }

  get size(): number {
    return this.memo.size;
  }
}

/** Разделитель прогонов в ключе кэша — символ, которого в тексте не бывает. */
const RUN_SEPARATOR = '\u001f';

/**
 * Подстановка данных строки в блок — той же функцией, что и рендер.
 *
 * `unfilled: 'blank'` — как на печати: пустое поле исчезает вместе
 * с разделителем, и меряется ровно то, что будет напечатано.
 */
export function renderTarget(target: FitTarget, data: Record<string, string>): RenderedTarget {
  const blocks = resolveRichDoc(target.doc, { data, unfilled: 'blank' });
  const runs = runsOfBlocks(blocks, target.style);
  return { runs, text: runsText(runs), key: runs.map((r) => r.text).join(RUN_SEPARATOR) };
}
