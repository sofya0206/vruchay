import { applyFitStepToStyle, fitSteps, NO_FIT, type FitStep } from '../schema/autofit';
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
  /**
   * Межсловный интервал в пунктах: Chromium добавляет его к каждому
   * пробелу. Необязательный — у блока целиком его нет, он бывает только
   * у прогона с маркой.
   */
  wordSpacing?: number;
  uppercase: boolean;
  /** Обводка вокруг букв в миллиметрах: она выступает за края глифов. */
  strokeWidth: number;
}

/**
 * Прогон: кусок текста и его начертание.
 *
 * Строка блока больше не набрана одним стилем: фамилия в имени может быть
 * полужирной, одно слово — другим кеглем. Измеритель поэтому работает
 * со списком прогонов, а прежние функции с одной строкой и одним стилем
 * — частный случай с одним прогоном. Ширина считается на прогон
 * и складывается: она линейна по буквам, и разрез строки на прогоны
 * одного стиля даёт ровно ту же сумму, что и строка целиком.
 */
export interface StyledRun {
  text: string;
  style: TextStyle;
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
  const wordsMm = style.wordSpacing ? ptToMm(style.wordSpacing) * spaces(source) : 0;
  return glyphsMm + spacingMm + wordsMm;
}

function spaces(text: string): number {
  let n = 0;
  for (const char of text) if (char === ' ' || char === '\u00A0') n++;
  return n;
}

/** Ширина строки из нескольких прогонов — сумма ширин прогонов. */
export function measureRuns(runs: StyledRun[], mode: MeasureMode = 'estimate'): number {
  let width = 0;
  for (const run of runs) width += measureLine(run.text, run.style, undefined, mode);
  return width;
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

/** Строка из прогонов без пробелов на конце: так её меряет и рисует браузер. */
function trimEndRuns(line: StyledRun[]): StyledRun[] {
  const out = [...line];
  while (out.length) {
    const last = out[out.length - 1];
    const trimmed = last.text.trimEnd();
    if (trimmed !== '') {
      out[out.length - 1] = { ...last, text: trimmed };
      break;
    }
    out.pop();
  }
  return out;
}

/** Кусок абзаца, набранного прогонами, по границам символов. */
function sliceRuns(runs: StyledRun[], offsets: number[], start: number, end: number): StyledRun[] {
  const out: StyledRun[] = [];
  for (let i = 0; i < runs.length; i++) {
    const from = Math.max(start, offsets[i]);
    const to = Math.min(end, offsets[i + 1]);
    if (to <= from) continue;
    out.push({ text: runs[i].text.slice(from - offsets[i], to - offsets[i]), style: runs[i].style });
  }
  return out;
}

/**
 * Перенос по словам строки из нескольких прогонов.
 *
 * Правила те же, что у `wrapText`, — pre-wrap и break-word браузера, —
 * но слово может начинаться в одном прогоне и кончаться в другом:
 * «Ива**нов**». Поэтому абзац сначала склеивается в одну строку, режется
 * на слова как обычно, а каждое слово потом раскладывается обратно
 * по прогонам по своим границам.
 *
 * Один прогон идёт прежней дорогой: это и быстрее, и гарантирует, что
 * старый макет без марок меряется ровно так, как мерился.
 */
export function wrapRuns(
  runs: StyledRun[],
  widthMm: number,
  mode: MeasureMode = 'safe',
): StyledRun[][] {
  if (runs.length === 0) return [[]];
  if (runs.length === 1) {
    return wrapText(runs[0].text, runs[0].style, widthMm, mode).map((text) =>
      text === '' ? [] : [{ text, style: runs[0].style }],
    );
  }

  const lines: StyledRun[][] = [];
  for (const paragraph of splitParagraphs(runs)) {
    if (paragraph.length === 0) {
      lines.push([]);
      continue;
    }

    const offsets = [0];
    for (const run of paragraph) offsets.push(offsets[offsets.length - 1] + run.text.length);
    const whole = paragraph.map((r) => r.text).join('');
    const chunks = [...whole.matchAll(/\S+\s*|\s+/g)];

    let line: StyledRun[] = [];
    let lineStart = 0;
    let lineEnd = 0;

    for (const chunk of chunks) {
      const end = (chunk.index ?? 0) + chunk[0].length;
      const candidate = sliceRuns(paragraph, offsets, lineStart, end);
      if (line.length === 0 || measureRuns(trimEndRuns(candidate), mode) <= widthMm) {
        line = candidate;
        lineEnd = end;
        continue;
      }

      lines.push(trimEndRuns(line));
      // Новая строка начинается со слова без ведущих пробелов — как у браузера.
      const leading = chunk[0].length - chunk[0].trimStart().length;
      lineStart = (chunk.index ?? 0) + leading;
      lineEnd = end;
      line = sliceRuns(paragraph, offsets, lineStart, lineEnd);
    }

    for (const piece of breakLongRuns(line, widthMm, mode)) lines.push(piece);
  }

  return lines;
}

/** Абзацы: переводы строк могут стоять внутри любого прогона. */
function splitParagraphs(runs: StyledRun[]): StyledRun[][] {
  const paragraphs: StyledRun[][] = [[]];
  for (const run of runs) {
    const parts = run.text.split('\n');
    parts.forEach((part, i) => {
      if (i > 0) paragraphs.push([]);
      if (part !== '') paragraphs[paragraphs.length - 1].push({ text: part, style: run.style });
    });
  }
  return paragraphs;
}

/** Слово шире блока рвётся посимвольно — с сохранением стиля каждой буквы. */
function breakLongRuns(line: StyledRun[], widthMm: number, mode: MeasureMode): StyledRun[][] {
  const trimmed = trimEndRuns(line);
  if (measureRuns(trimmed, mode) <= widthMm) return [trimmed];

  const out: StyledRun[][] = [];
  let current: StyledRun[] = [];

  const append = (list: StyledRun[], char: string, style: TextStyle): StyledRun[] => {
    const last = list[list.length - 1];
    if (last && last.style === style) {
      return [...list.slice(0, -1), { text: last.text + char, style }];
    }
    return [...list, { text: char, style }];
  };

  for (const run of line) {
    for (const char of run.text) {
      const next = append(current, char, run.style);
      if (current.length !== 0 && measureRuns(next, mode) > widthMm) {
        out.push(current);
        current = [{ text: char, style: run.style }];
      } else {
        current = next;
      }
    }
  }
  if (current.length) out.push(trimEndRuns(current));
  return out;
}

export interface Measured {
  lines: string[];
  widthMm: number;
  heightMm: number;
}

export interface MeasuredRuns {
  lines: StyledRun[][];
  widthMm: number;
  heightMm: number;
}

/**
 * Высота строки из прогонов — по самому высокому из них.
 *
 * Так строит строку и браузер: при `line-height` числом каждый прогон
 * получает свою высоту от своего кегля, а строка растёт до самого
 * высокого. Пустая строка — высоты блока.
 */
function lineHeightMm(line: StyledRun[], base: TextStyle): number {
  let tallest = 0;
  for (const run of line) tallest = Math.max(tallest, run.style.fontSize * run.style.lineHeight);
  if (line.length === 0) tallest = base.fontSize * base.lineHeight;
  return ptToMm(tallest);
}

/**
 * Высота области глифов в долях кегля — то, что выступает за строку,
 * когда межстрочный меньше неё.
 *
 * Строка в CSS — это `line-height`, а буквы рисуются в своей области
 * (подъём плюс спуск шрифта), и у наборных гарнитур она около 1,3 em.
 * При межстрочном 1,2 нижний хвост последней строки выступает за блок
 * на 0,05 em, при 1,0 — на 0,15 em, и Chromium считает этот хвост
 * переполнением: с `overflow: hidden` спуски последней строки обрезаются.
 * Блок выравнивает текст по центру, поэтому хвост «стоит» дважды —
 * сверху и снизу. Значение одно на все семейства и с запасом (у PT Serif
 * замерено 1,28): ошибка в сторону лишнего предупреждения.
 */
export const CONTENT_AREA_EM = 1.3;

/** Насколько область глифов выступает за строки блока — в мм. */
function glyphOverhangMm(runs: StyledRun[], base: TextStyle): number {
  let worst = Math.max(0, CONTENT_AREA_EM - base.lineHeight) * base.fontSize;
  for (const run of runs) {
    worst = Math.max(worst, Math.max(0, CONTENT_AREA_EM - run.style.lineHeight) * run.style.fontSize);
  }
  return ptToMm(worst);
}

/** Во что превратится набранный прогонами текст в блоке заданной ширины. */
export function layoutRuns(
  runs: StyledRun[],
  base: TextStyle,
  box: BoxMm,
  mode: MeasureMode = 'safe',
): MeasuredRuns {
  const inner = Math.max(box.w - base.strokeWidth, 0.1);
  const lines = wrapRuns(runs, inner, mode);

  let widthMm = 0;
  let heightMm = 0;
  for (const line of lines) {
    widthMm = Math.max(widthMm, measureRuns(line, mode));
    heightMm += lineHeightMm(line, base);
  }

  return {
    lines,
    widthMm: widthMm + base.strokeWidth,
    heightMm: heightMm + base.strokeWidth + glyphOverhangMm(runs, base),
  };
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
  /** Ступень лестницы автомасштаба, на которой остановились: 0 — как есть. */
  step: number;
  /** Сама ступень — то, что применяет и браузер. */
  fit: FitStep;
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
 * Один прогон: то же, что `fitRuns` с одним прогоном, и ровно те же числа,
 * что были до прогонов, — на этом стоят вердикты проверки списка.
 */
export function fitText(
  text: string,
  style: TextStyle,
  box: BoxMm,
  autoFit: boolean,
): FitResult {
  return fitRuns([{ text, style }], style, box, autoFit);
}

/**
 * Влезает ли набранный прогонами текст — и на какой ступени лестницы
 * автомасштаба, если она включена.
 *
 * Ступени — из `fitSteps`, те же, по которым текст ужимает браузер
 * на холсте и на печати; здесь они лишь примеряются заранее, без
 * браузера, чтобы проверка списка сказала «не влезет» до печати.
 * Кегль блока — единица масштаба: прогон, набранный крупнее блока,
 * уменьшается вместе с ним в той же пропорции, иначе лестница ломала бы
 * соотношение размеров внутри строки.
 */
export function fitRuns(
  runs: StyledRun[],
  base: TextStyle,
  box: BoxMm,
  autoFit: boolean,
): FitResult {
  const report = (m: MeasuredRuns, step: number, fit: FitStep): FitResult => ({
    fits: m.heightMm <= box.h && m.widthMm <= box.w + 1e-9,
    fontSize: Math.round(base.fontSize * fit.fontScale * 100) / 100,
    lines: m.lines.length,
    widthMm: m.widthMm,
    heightMm: m.heightMm,
    overflowRatio: box.h > 0 ? m.heightMm / box.h : Infinity,
    step,
    fit,
  });

  const asIs = report(layoutRuns(runs, base, box), 0, NO_FIT);
  if (asIs.fits || !autoFit) return asIs;

  const steps = fitSteps(base.lineHeight);
  let last = asIs;
  for (let i = 1; i < steps.length; i++) {
    const step = steps[i];
    // Мельче осмысленного кегля не спускаемся, какой бы ни была ступень.
    if (base.fontSize * step.fontScale < MIN_FONT_SIZE_PT) break;
    const attempt = layoutRuns(applyFitStep(runs, step), applyFitStepToStyle(base, step), box);
    last = report(attempt, i, step);
    if (last.fits) return last;
  }
  return last;
}

/** Прогоны на ступени лестницы — каждый своим кеглем, в той же пропорции. */
export function applyFitStep(runs: StyledRun[], step: FitStep): StyledRun[] {
  if (step === NO_FIT) return runs;
  return runs.map((run) => ({ text: run.text, style: applyFitStepToStyle(run.style, step) }));
}

export { applyFitStepToStyle } from '../schema/autofit';
export { resolveFace, knownFaces } from './metrics';
export type { FaceMetrics, ResolvedFace } from './metrics';
