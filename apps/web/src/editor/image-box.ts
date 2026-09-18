import { clamp, MIN_SIZE_MM, roundBox, type Box } from './geometry';
import type { ImageSize } from './fit-page';

/**
 * Сторона квадрата, в который вписывается новая картинка, мм.
 * Логотип, подпись и печать на грамоте — все примерно такого размера.
 */
export const IMAGE_BOX_MM = 50;

/**
 * Разрешение, дальше которого картинку при вставке не растягиваем.
 * Мельче — и на бумаге видны пиксели; увеличить сознательно можно всегда.
 */
export const MIN_INSERT_DPI = 150;

const MM_PER_INCH = 25.4;

/**
 * Где и какого размера встанет новая картинка.
 *
 * Пропорции — как у файла: блок другой формы картинка заполнит не целиком,
 * и рамка выделения разойдётся с тем, что видно. `at` — центр блока
 * (точка, куда бросили файл); без него — середина листа.
 */
export function insertedImageBox(
  size: ImageSize | null,
  page: { w: number; h: number },
  at?: { x: number; y: number },
): Box {
  const aspect = size && size.width > 0 && size.height > 0 ? size.width / size.height : 1;
  const limit = Math.min(IMAGE_BOX_MM, page.w * 0.6, page.h * 0.6);

  let w = aspect >= 1 ? limit : limit * aspect;
  let h = aspect >= 1 ? limit / aspect : limit;

  if (size) {
    const natural = (Math.max(size.width, size.height) / MIN_INSERT_DPI) * MM_PER_INCH;
    const k = Math.min(1, natural / Math.max(w, h));
    w *= k;
    h *= k;
  }
  w = Math.max(w, MIN_SIZE_MM);
  h = Math.max(h, MIN_SIZE_MM);

  const cx = at?.x ?? page.w / 2;
  const cy = at?.y ?? page.h / 2;
  return roundBox({
    x: clamp(cx - w / 2, 0, Math.max(page.w - w, 0)),
    y: clamp(cy - h / 2, 0, Math.max(page.h - h, 0)),
    w,
    h,
  });
}
