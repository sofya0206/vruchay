import { resolveFace, type FaceMetrics } from './metrics';

/**
 * Измерение текста без браузера.
 *
 * Лист печатает Chromium, и он же — единственный настоящий шрифтовой движок
 * в проекте. Но проверить список на десять тысяч человек, отрисовав десять
 * тысяч листов, невозможно: это часы работы и гигабайты памяти. Поэтому
 * здесь повторён ровно тот кусок его работы, который отвечает на вопрос
 * «влезет ли»: ширины букв, перенос по словам, высота строк.
 *
 * Совпадение с Chromium проверяется тестом. Расхождение даёт кернинг,
 * который мы не читаем; он сближает буквы, поэтому наша ширина выходит
 * чуть больше настоящей. Сторона ошибки выбрана намеренно: лишнее
 * предупреждение стоит одного взгляда, пропущенное обрезание — грамоты.
 */

/** В типографском пункте 1/72 дюйма, в дюйме 25,4 мм. */
export const MM_PER_PT = 25.4 / 72;

export function ptToMm(pt: number): number {
  return pt * MM_PER_PT;
}

/** Начертание и оформление текстового блока — всё, что влияет на размеры. */
export interface TextStyle {
  fontFamily: string;
  /** Кегль в пунктах. */
  fontSize: number;
  bold: boolean;
  italic: boolean;
  /** Множитель межстрочного расстояния, как в CSS line-height числом. */
  lineHeight: number;
  /** Разрядка в пунктах. */
  letterSpacing: number;
  uppercase: boolean;
  /** Обводка вокруг букв в миллиметрах: она выступает за края глифов. */
  strokeWidth: number;
}

/** Размеры блока в миллиметрах — те же, в которых хранится макет. */
export interface BoxMm {
  w: number;
  h: number;
}

function widthOf(face: FaceMetrics, codePoint: number): number {
  return face.widths.get(codePoint) ?? face.fallbackWidth;
}

/**
 * Какой поправкой на вязь мерить.
 *
 * «estimate» — средней: лучшая догадка о том, что сделает Chromium.
 * Ею отвечают на вопрос «сколько это займёт».
 *
 * «safe» — худшей из корпуса: ею отвечают на вопрос «влезет ли».
 * Разница в том, чем платить за ошибку. Занижение ширины — это
 * «сказали, что влезет», а оно обрезалось на печати, и заметит это
 * получатель. Завышение — лишнее предупреждение, которое стоит взгляда.
 */
export type MeasureMode = 'estimate' | 'safe';

function shapingFor(face: FaceMetrics, mode: MeasureMode): number {
  return mode === 'safe' ? face.shapingMax : face.shaping;
}

/**
 * Ширина одной строки в миллиметрах.
 *
 * Разрядка в CSS добавляется после каждого символа, включая последний, —
 * Chromium ведёт себя именно так, и на коротких строках в широком блоке
 * этот последний интервал заметен. На саму разрядку поправка на вязь
 * не распространяется: это чистая добавка браузера поверх букв.
 */
export function measureLine(
  text: string,
  style: TextStyle,
  face?: FaceMetrics,
  mode: MeasureMode = 'estimate',
): number {
  const metrics = face ?? resolveFace(style).metrics;
  const source = style.uppercase ? text.toLocaleUpperCase('ru-RU') : text;

  let units = 0;
  let count = 0;
  for (const char of source) {
    units += widthOf(metrics, char.codePointAt(0) ?? 0);
    count++;
  }

  const glyphsMm =
    ptToMm((units / metrics.unitsPerEm) * style.fontSize) * shapingFor(metrics, mode);
  const spacingMm = ptToMm(style.letterSpacing) * count;
  return glyphsMm + spacingMm;
}

/**
 * Перенос по словам, как его делает браузер при `pre-wrap` и `break-word`:
 * переводы строк из текста сохраняются, длинные слова рвутся посреди слова,
 * если целиком не помещаются в блок.
 */
export function wrapText(
  text: string,
  style: TextStyle,
  widthMm: number,
  mode: MeasureMode = 'safe',
): string[] {
  const face = resolveFace(style).metrics;
  const lines: string[] = [];

  for (const paragraph of text.split('\n')) {
    if (paragraph === '') {
      lines.push('');
      continue;
    }

    // Пробелы оставляем при слове слева: так их и переносит браузер,
    // и ширина строки считается вместе с ними.
    const chunks = paragraph.match(/\S+\s*|\s+/g) ?? [];
    let line = '';

    for (const chunk of chunks) {
      const candidate = line + chunk;
      if (line === '' || measureLine(candidate.trimEnd(), style, face, mode) <= widthMm) {
        line = candidate;
        continue;
      }

      lines.push(line.trimEnd());
      line = chunk.trimStart();
    }

    // Слово, которое не влезает в блок целиком, браузер рвёт посимвольно.
    for (const piece of breakLongLine(line, style, face, widthMm, mode)) lines.push(piece);
  }

  return lines;
}

function breakLongLine(
  line: string,
  style: TextStyle,
  face: FaceMetrics,
  widthMm: number,
  mode: MeasureMode,
): string[] {
  if (measureLine(line.trimEnd(), style, face, mode) <= widthMm) return [line.trimEnd()];

  const out: string[] = [];
  let current = '';
  for (const char of line) {
    // Один символ шире блока — рвать дальше некуда, браузер тоже сдаётся
    // и выпускает его за край.
    if (current !== '' && measureLine(current + char, style, face, mode) > widthMm) {
      out.push(current);
      current = char;
    } else {
      current += char;
    }
  }
  if (current !== '') out.push(current.trimEnd());
  return out;
}

export interface Measured {
  lines: string[];
  widthMm: number;
  heightMm: number;
}

/** Во что превратится текст в блоке заданной ширины. */
export function layoutText(
  text: string,
  style: TextStyle,
  box: BoxMm,
  mode: MeasureMode = 'safe',
): Measured {
  // Обводка кладётся по контуру буквы и половиной толщины выходит наружу
  // с каждой стороны — на доступную ширину это влияет обеими половинами.
  const inner = Math.max(box.w - style.strokeWidth, 0.1);
  const lines = wrapText(text, style, inner, mode);
  const face = resolveFace(style).metrics;

  let widthMm = 0;
  for (const line of lines) widthMm = Math.max(widthMm, measureLine(line, style, face, mode));

  return {
    lines,
    widthMm: widthMm + style.strokeWidth,
    heightMm: ptToMm(style.fontSize * style.lineHeight) * lines.length + style.strokeWidth,
  };
}

export interface FitResult {
  fits: boolean;
  /** Кегль, при котором текст помещается, — он же исходный, если уменьшать не пришлось. */
  fontSize: number;
  lines: number;
  widthMm: number;
  heightMm: number;
  /** Во сколько раз текст выше блока: 1,0 — впритык, 1,5 — вылезает в полтора раза. */
  overflowRatio: number;
}

/**
 * Ниже этой доли исходного кегля автомасштаб не опускается.
 *
 * Смысл автомасштаба — подобрать длинную фамилию под блок, а не вписать
 * в грамоту нечитаемое. Уменьшенное вдвое имя на фоне остального текста
 * выглядит ошибкой вёрстки, и лучше сказать об этом человеку, чем молча
 * напечатать.
 */
export const MIN_AUTO_FIT_RATIO = 0.5;

/** Кегль мельче этого не бывает осмысленным ни при каком масштабе. */
export const MIN_FONT_SIZE_PT = 5;

/**
 * Влезает ли текст в блок — и если включён автомасштаб, при каком кегле.
 *
 * Подбор половинным делением: кегль монотонно влияет на высоту, поэтому
 * перебирать по пункту незачем. Точность в четверть пункта — мельче
 * человек не различает, а лишние итерации на десяти тысячах строк заметны.
 */
export function fitText(
  text: string,
  style: TextStyle,
  box: BoxMm,
  autoFit: boolean,
): FitResult {
  const measured = layoutText(text, style, box);
  const fitsAsIs = measured.heightMm <= box.h && measured.widthMm <= box.w + 1e-9;

  if (fitsAsIs || !autoFit) {
    return {
      fits: fitsAsIs,
      fontSize: style.fontSize,
      lines: measured.lines.length,
      widthMm: measured.widthMm,
      heightMm: measured.heightMm,
      overflowRatio: box.h > 0 ? measured.heightMm / box.h : Infinity,
    };
  }

  const floor = Math.max(style.fontSize * MIN_AUTO_FIT_RATIO, MIN_FONT_SIZE_PT);
  if (floor >= style.fontSize) {
    return {
      fits: false,
      fontSize: style.fontSize,
      lines: measured.lines.length,
      widthMm: measured.widthMm,
      heightMm: measured.heightMm,
      overflowRatio: box.h > 0 ? measured.heightMm / box.h : Infinity,
    };
  }

  const at = (size: number) => layoutText(text, { ...style, fontSize: size }, box);

  const smallest = at(floor);
  if (smallest.heightMm > box.h || smallest.widthMm > box.w + 1e-9) {
    return {
      fits: false,
      fontSize: floor,
      lines: smallest.lines.length,
      widthMm: smallest.widthMm,
      heightMm: smallest.heightMm,
      overflowRatio: box.h > 0 ? smallest.heightMm / box.h : Infinity,
    };
  }

  let low = floor;
  let high = style.fontSize;
  while (high - low > 0.25) {
    const middle = (low + high) / 2;
    const attempt = at(middle);
    if (attempt.heightMm <= box.h && attempt.widthMm <= box.w + 1e-9) low = middle;
    else high = middle;
  }

  /*
   * Округляем вниз, а не к ближайшему.
   *
   * Округление вверх поднимает кегль выше проверенного, и текст может
   * перескочить на лишнюю строку — тогда мы возвращали бы «влезает»
   * вместе с размером, при котором оно уже не влезает. Разница в четверть
   * пункта незаметна, а такая ошибка — это обрезанная фамилия на бумаге.
   */
  const chosen = Math.max(Math.floor(low * 4) / 4, floor);
  // Меряем ещё раз именно на выбранном кегле: числа в отчёте должны
  // описывать его, а не соседнюю ступень перебора.
  const best = at(chosen);

  return {
    fits: best.heightMm <= box.h && best.widthMm <= box.w + 1e-9,
    fontSize: chosen,
    lines: best.lines.length,
    widthMm: best.widthMm,
    heightMm: best.heightMm,
    overflowRatio: box.h > 0 ? best.heightMm / box.h : Infinity,
  };
}

export { resolveFace, knownFaces } from './metrics';
export type { FaceMetrics, ResolvedFace } from './metrics';
