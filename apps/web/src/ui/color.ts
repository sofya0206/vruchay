/**
 * Цвет: разбор кода и перевод между записями. Без разметки — её и проверяем.
 */

/**
 * Приводит введённое к виду `#rrggbb` или возвращает null, если это ещё
 * не цвет. Понимает запись без решётки и трёхзначную — их пишут чаще,
 * чем кажется, а системная пипетка принимала только полную форму.
 */
export function normalizeHex(raw: string): string | null {
  const value = raw.trim().replace(/^#/, '').toLowerCase();

  if (/^[0-9a-f]{6}$/.test(value)) return `#${value}`;
  if (/^[0-9a-f]{3}$/.test(value)) {
    return `#${[...value].map((c) => c + c).join('')}`;
  }
  return null;
}

export interface Hsv {
  /** Оттенок, 0–360. */
  h: number;
  /** Насыщенность, 0–1. */
  s: number;
  /** Яркость, 0–1. */
  v: number;
}

/**
 * Из кода в оттенок-насыщенность-яркость.
 *
 * У серого оттенок не определён: делитель обращается в ноль. Отдаём 0 —
 * иначе ползунок оттенка прыгал бы в случайное место каждый раз, когда
 * человек уводит насыщенность в ноль и возвращает обратно.
 */
export function hexToHsv(hex: string): Hsv {
  const full = normalizeHex(hex) ?? '#000000';
  const r = parseInt(full.slice(1, 3), 16) / 255;
  const g = parseInt(full.slice(3, 5), 16) / 255;
  const b = parseInt(full.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const span = max - min;

  let h = 0;
  if (span !== 0) {
    if (max === r) h = ((g - b) / span) % 6;
    else if (max === g) h = (b - r) / span + 2;
    else h = (r - g) / span + 4;
    h *= 60;
    if (h < 0) h += 360;
  }

  return { h, s: max === 0 ? 0 : span / max, v: max };
}

export function hsvToHex({ h, s, v }: Hsv): string {
  // Оттенок приводим к кругу сразу: полоса выдаёт и 360, и отрицательные,
  // а несведённое значение даёт отрицательную долю и цвет наизнанку.
  const hue = ((h % 360) + 360) % 360;
  const c = v * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = v - c;
  const sector = Math.floor(hue / 60) % 6;
  const [r, g, b] = (
    [
      [c, x, 0],
      [x, c, 0],
      [0, c, x],
      [0, x, c],
      [x, 0, c],
      [c, 0, x],
    ] as const
  )[sector];

  const byte = (n: number) =>
    Math.round((n + m) * 255)
      .toString(16)
      .padStart(2, '0');

  return `#${byte(r)}${byte(g)}${byte(b)}`;
}
