/**
 * Готовые форматы листа.
 *
 * Размеры в миллиметрах, как и весь макет: документ печатают на бумаге,
 * и любая другая единица потребовала бы пересчёта, который однажды разойдётся
 * с тем, что человек видит в редакторе.
 */

export interface PageSize {
  /** Ключ для выбора в интерфейсе. */
  id: string;
  label: string;
  widthMm: number;
  heightMm: number;
}

/**
 * Книжные форматы. Альбомные получаются переворотом — см. rotate().
 *
 * Letter и Legal — для партнёров за рубежом: у них A4 не печатается
 * без полей. Квадрат и 16:9 — не бумага, а картинка для соцсетей
 * и экрана: бейдж участника, диплом в сторис.
 */
export const PAGE_FORMATS = [
  { id: 'a3', label: 'A3', widthMm: 297, heightMm: 420 },
  { id: 'a4', label: 'A4', widthMm: 210, heightMm: 297 },
  { id: 'a5', label: 'A5', widthMm: 148, heightMm: 210 },
  { id: 'a6', label: 'A6', widthMm: 105, heightMm: 148 },
  { id: 'letter', label: 'US Letter', widthMm: 216, heightMm: 279 },
  { id: 'legal', label: 'US Legal', widthMm: 216, heightMm: 356 },
  { id: 'square', label: 'Квадрат 1:1', widthMm: 210, heightMm: 210 },
  { id: 'wide', label: 'Экран 16:9', widthMm: 167, heightMm: 297 },
] as const;

export type PageOrientation = 'portrait' | 'landscape';

/** Меняет ориентацию, не трогая сам формат. */
export function rotate(size: { widthMm: number; heightMm: number }, to: PageOrientation) {
  const isLandscape = size.widthMm > size.heightMm;
  const needLandscape = to === 'landscape';
  if (isLandscape === needLandscape) return { ...size };
  return { widthMm: size.heightMm, heightMm: size.widthMm };
}

export function orientationOf(size: { widthMm: number; heightMm: number }): PageOrientation {
  return size.widthMm > size.heightMm ? 'landscape' : 'portrait';
}

/**
 * Какому формату соответствуют размеры — независимо от ориентации.
 *
 * Допуск в полмиллиметра: размеры приходят числами с плавающей точкой,
 * и сравнение «в лоб» изредка не совпало бы там, где человек видит ровное A4.
 */
export function matchFormat(size: { widthMm: number; heightMm: number }): PageSize | null {
  const [w, h] = [Math.min(size.widthMm, size.heightMm), Math.max(size.widthMm, size.heightMm)];
  return (
    PAGE_FORMATS.find(
      (f) => Math.abs(f.widthMm - w) < 0.5 && Math.abs(f.heightMm - h) < 0.5,
    ) ?? null
  );
}

/** Человекочитаемое имя размера: «A4, альбомная» или «210×297 мм». */
export function describeSize(size: { widthMm: number; heightMm: number }): string {
  const format = matchFormat(size);
  const orientation = orientationOf(size) === 'landscape' ? 'альбомная' : 'книжная';
  if (format) return `${format.label}, ${orientation}`;
  return `${Math.round(size.widthMm)}×${Math.round(size.heightMm)} мм`;
}
