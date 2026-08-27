import rawMetrics from './metrics.json';

/**
 * Метрики шрифтов: ширины букв, снятые с тех же файлов, которые Chromium
 * грузит при печати, — и снятые самим Chromium. Файл metrics.json собирается
 * scripts/build-font-metrics.mjs и коммитится; разбирать шрифты на лету
 * незачем, а разбирать их самостоятельно ещё и опасно: шесть семейств
 * из восьми переменные, и их полужирное начертание не лежит в шрифте
 * готовым, а получается поправками.
 *
 * Единица — тысячная доля em. Чтобы получить размер, ширину делят
 * на UNITS_PER_EM и умножают на кегль.
 */

export interface FaceMetrics {
  /** Имя семейства, как оно стоит в CSS. */
  family: string;
  weight: number;
  style: 'normal' | 'italic';
  unitsPerEm: number;
  /** Ширины символов: код → ширина в тысячных долях em. */
  widths: Map<number, number>;
  /**
   * Во сколько раз настоящая строка шире суммы своих букв.
   *
   * Ширина строки не равна сумме ширин её букв: кернинг сдвигает пары,
   * а рукописные шрифты подменяют буквы связными вариантами. Поправка
   * снята браузером на корпусе настоящих наградных строк — см.
   * scripts/build-font-metrics.mjs.
   *
   * `shaping` — средняя, лучшая оценка того, что сделает Chromium.
   * `shapingMax` — худшая из корпуса; ею меряется решение «влезает ли»,
   * чтобы ошибка падала в сторону лишнего предупреждения, а не брака.
   */
  shaping: number;
  shapingMax: number;
  /**
   * Чем меряем символ, которого в шрифте нет.
   *
   * Chromium в этом случае берёт букву из подменного шрифта системы,
   * и какая она там — мы знать не можем. Берём ширину строчной «о»:
   * она близка к средней и не даёт ни грубого занижения, ни завышения.
   */
  fallbackWidth: number;
}

interface RawFace {
  family: string;
  weight: number;
  style: 'normal' | 'italic';
  shaping: number;
  shapingMax: number;
  runs: [number, number[]][];
}

interface RawMetrics {
  schemaVersion: number;
  unitsPerEm: number;
  faces: Record<string, RawFace>;
}

/*
 * Через unknown: из JSON пары «первый код, ширины» выводятся как массив
 * произвольной длины, а не как пара. Файл собран нашим же скриптом
 * scripts/build-font-metrics.mjs, и форма в нём именно такая.
 */
const raw = rawMetrics as unknown as RawMetrics;

export const UNITS_PER_EM = raw.unitsPerEm;

function expand(face: RawFace): FaceMetrics {
  const widths = new Map<number, number>();
  for (const [first, run] of face.runs) {
    for (let i = 0; i < run.length; i++) widths.set(first + i, run[i]);
  }
  return {
    family: face.family,
    weight: face.weight,
    style: face.style,
    unitsPerEm: raw.unitsPerEm,
    widths,
    shaping: face.shaping,
    shapingMax: face.shapingMax,
    fallbackWidth: widths.get(0x043e) ?? widths.get(0x6f) ?? Math.round(raw.unitsPerEm / 2),
  };
}

// Раскрываем при первом обращении: начертаний два с лишним десятка,
// а в одном документе используются два-три.
const cache = new Map<string, FaceMetrics>();

/** Как имя семейства превращается в часть ключа начертания. */
function slug(family: string): string {
  return family
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export interface FaceRequest {
  fontFamily: string;
  bold: boolean;
  italic: boolean;
}

export interface ResolvedFace {
  metrics: FaceMetrics;
  /**
   * Точного начертания в наборе нет, взято ближайшее.
   *
   * Так бывает с рукописными: у Marck Script есть только обычное начертание,
   * а поставить ему в редакторе полужирный и курсив никто не мешает —
   * Chromium тогда рисует поддельные, наклоняя и утолщая обычный. Поддельные
   * шире настоящих, поэтому измерение по ближайшему занижает ширину,
   * и об этом приходится говорить вслух.
   */
  substituted: boolean;
}

/** Семейство по умолчанию — то же, что в схеме макета. */
const FALLBACK_FAMILY = 'PT Sans';

export function resolveFace(request: FaceRequest): ResolvedFace {
  const weight = request.bold ? '700' : '400';
  const style = request.italic ? 'italic' : 'normal';
  const base = slug(request.fontFamily);

  // По убыванию точности: точное начертание, потом без курсива, потом
  // без полужирного, потом обычное — и только затем чужое семейство.
  const candidates = [
    `${base}-${weight}-${style}`,
    `${base}-${weight}-normal`,
    `${base}-400-${style}`,
    `${base}-400-normal`,
  ];

  for (let i = 0; i < candidates.length; i++) {
    const key = candidates[i];
    const face = raw.faces[key];
    if (!face) continue;

    let metrics = cache.get(key);
    if (!metrics) {
      metrics = expand(face);
      cache.set(key, metrics);
    }
    return { metrics, substituted: i > 0 };
  }

  const fallback = resolveFace({ fontFamily: FALLBACK_FAMILY, bold: false, italic: false });
  return { metrics: fallback.metrics, substituted: true };
}

/** Все начертания, которые мы умеем мерить, — для проверок и диагностики. */
export function knownFaces(): string[] {
  return Object.keys(raw.faces);
}
