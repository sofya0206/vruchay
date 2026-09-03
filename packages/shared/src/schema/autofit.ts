/**
 * Лестница автомасштаба текста в блоке.
 *
 * Если текст не влезает, он не вылезает за рамку и не обрезается молча —
 * он ужимается по ступеням, и порядок ступеней выбран так, чтобы первые
 * из них глаз не замечал, а последние были заметны, но не портили набор:
 *
 *  1. кегль 100 → 65 % — незаметно;
 *  2. межстрочный 1,2 → 1,0 (не больше −20 %) — только когда строк больше одной;
 *  3. кегль 65 → 50 %;
 *  4. разрядка до −3 % em — дальше сцепляются «л», «п», «н», и кириллица
 *     читается хуже, чем обрезанная строка.
 *
 * Дальше ступеней нет намеренно: многоточие для ФИО недопустимо, а сжатие
 * по горизонтали «дешевит» документ. Что не влезло на последней ступени —
 * попадает в отчёт «проверить все строки», и решает человек.
 *
 * Ступени дискретны, как в PowerPoint (`normAutofit fontScale`): плавный
 * подбор при наборе выглядит нервно, текст «дёргается» на каждой букве.
 *
 * Одна и та же лестница нужна двум местам: измерителю на сервере
 * («влезет ли» до печати) и подгонке в браузере (холст и печать).
 * Разойтись они не могут, потому что читают один список.
 */

export interface FitStep {
  /** Доля кегля блока: 1 — как есть, 0,5 — вдвое мельче. */
  fontScale: number;
  /** Доля межстрочного: 1 — как в блоке, меньше — плотнее. */
  lineScale: number;
  /** Дополнительная разрядка в долях em (отрицательная — сближение). */
  trackingEm: number;
}

/** Ступени кегля до межстрочного и после. */
const FONT_STEPS_BEFORE_LINE = [1, 0.925, 0.85, 0.775, 0.7, 0.65];
const FONT_STEPS_AFTER_LINE = [0.6, 0.55, 0.5];
const TRACKING_STEPS = [-0.02, -0.03];

/** Ниже этой доли межстрочный не ужимается. */
export const MIN_LINE_SCALE = 0.8;

/**
 * Лестница для блока с данным межстрочным.
 *
 * Межстрочный ужимается только до единицы и не больше чем на пятую часть:
 * при 1,2 это ×0,833, при 1,1 — ×0,909, при 1,0 — ступени межстрочного
 * нет вовсе, и лестница короче.
 */
export function fitSteps(lineHeight: number): FitStep[] {
  const lineScale = lineHeight > 1 ? Math.max(MIN_LINE_SCALE, 1 / lineHeight) : 1;
  const steps: FitStep[] = [];

  for (const fontScale of FONT_STEPS_BEFORE_LINE) steps.push({ fontScale, lineScale: 1, trackingEm: 0 });
  if (lineScale < 1) steps.push({ fontScale: 0.65, lineScale, trackingEm: 0 });
  for (const fontScale of FONT_STEPS_AFTER_LINE) steps.push({ fontScale, lineScale, trackingEm: 0 });
  for (const trackingEm of TRACKING_STEPS) steps.push({ fontScale: 0.5, lineScale, trackingEm });

  return steps;
}

/** Первая ступень — «как есть». */
export const NO_FIT: FitStep = { fontScale: 1, lineScale: 1, trackingEm: 0 };

/** Начертание, которое лестница умеет ужимать: кегль, межстрочный, разрядка (pt). */
export interface FittableStyle {
  fontSize: number;
  lineHeight: number;
  letterSpacing: number;
}

/**
 * Начертание на ступени лестницы: кегль, межстрочный, разрядка.
 *
 * Одна функция на браузер и измеритель: разрядка считается в долях em
 * от уже ужатого кегля, и оба применяют её одинаково.
 */
export function applyFitStepToStyle<T extends FittableStyle>(style: T, step: FitStep): T {
  if (step === NO_FIT) return style;
  const fontSize = style.fontSize * step.fontScale;
  return {
    ...style,
    fontSize,
    lineHeight: style.lineHeight * step.lineScale,
    letterSpacing: style.letterSpacing + step.trackingEm * fontSize,
  };
}
