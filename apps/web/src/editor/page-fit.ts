import type { SheetElement, SheetLayout } from '@gramota/shared';
import { MIN_SIZE_MM } from './geometry';

/**
 * Подстройка макета под другой размер листа.
 *
 * Макет нарисован под A4 альбомный, а печатать решили на A5 или сделать
 * квадратный бейдж для соцсетей. Три способа, и выбирает человек:
 *
 *  — `scale` — всё пропорционально: позиции, размеры, кегли умножаются
 *    на один коэффициент, композиция остаётся той же, только крупнее
 *    или мельче. Если пропорции листов разные, композиция встаёт по центру;
 *  — `reposition` — кегли и размеры как были, меняются только положения:
 *    центр каждого блока остаётся на той же доле листа. Так поступают,
 *    когда шрифт подобран под конкретный бланк и трогать его нельзя;
 *  — `keep` — ничего не трогать; отдельно возвращаем, какие блоки
 *    вылезли за новый лист, чтобы предупредить.
 */
export type ResizeMode = 'scale' | 'reposition' | 'keep';

export interface PageMm {
  w: number;
  h: number;
}

export interface Resized {
  layout: SheetLayout;
  /** Блоки, которые после подстройки не помещаются на лист (целиком или частью). */
  overflowing: string[];
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

export function resizeLayout(layout: SheetLayout, from: PageMm, to: PageMm, mode: ResizeMode): Resized {
  if (mode === 'keep' || (from.w === to.w && from.h === to.h)) {
    return { layout, overflowing: overflowingIds(layout, to) };
  }

  if (mode === 'scale') {
    const k = Math.min(to.w / from.w, to.h / from.h);
    const offsetX = (to.w - from.w * k) / 2;
    const offsetY = (to.h - from.h * k) / 2;
    const scaled = layout.map((el) => scaleElement(el, k, offsetX, offsetY));
    return { layout: scaled, overflowing: overflowingIds(scaled, to) };
  }

  const moved = layout.map((el): SheetElement => {
    const cx = (el.x + el.w / 2) / from.w;
    const cy = (el.y + el.h / 2) / from.h;
    const x = cx * to.w - el.w / 2;
    const y = cy * to.h - el.h / 2;
    return {
      ...el,
      x: round(Math.max(0, Math.min(x, to.w - el.w))),
      y: round(Math.max(0, Math.min(y, to.h - el.h))),
    };
  });
  return { layout: moved, overflowing: overflowingIds(moved, to) };
}

/**
 * Блок в другом масштабе. Кроме коробки масштабируются все величины
 * в миллиметрах и пунктах: кегль, разрядка, отступ, рамка, обводка —
 * иначе рамка в полмиллиметра на A6 оказалась бы толще текста.
 */
function scaleElement(el: SheetElement, k: number, offsetX: number, offsetY: number): SheetElement {
  const box = {
    x: round(offsetX + el.x * k),
    y: round(offsetY + el.y * k),
    w: round(Math.max(el.w * k, MIN_SIZE_MM)),
    h: round(Math.max(el.h * k, MIN_SIZE_MM)),
  };

  if (el.type === 'text') {
    const p = el.props;
    return {
      ...el,
      ...box,
      props: {
        ...p,
        fontSize: round(Math.max(p.fontSize * k, 4)),
        letterSpacing: round(p.letterSpacing * k),
        padding: round(p.padding * k),
        borderWidth: round(p.borderWidth * k),
        strokeWidth: round(Math.min(p.strokeWidth * k, 2)),
        doc: scaleMarks(p.doc, k),
      },
    };
  }

  if (el.type === 'shape') {
    const p = el.props;
    return {
      ...el,
      ...box,
      props: { ...p, strokeWidth: round(p.strokeWidth * k), radius: round(p.radius * k), dash: round(p.dash * k) },
    };
  }

  return { ...el, ...box };
}

/** Кегли и разрядка в марках прогонов — в той же пропорции, что и блок. */
function scaleMarks<T>(node: T, k: number): T {
  if (Array.isArray(node)) return node.map((item) => scaleMarks(item, k)) as T;
  if (!node || typeof node !== 'object') return node;
  const record = node as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (key === 'attrs' && record.type === 'textStyle' && value && typeof value === 'object') {
      const attrs = { ...(value as Record<string, unknown>) };
      if (typeof attrs.fontSize === 'number') attrs.fontSize = round(attrs.fontSize * k);
      if (typeof attrs.letterSpacing === 'number') attrs.letterSpacing = round(attrs.letterSpacing * k);
      if (typeof attrs.wordSpacing === 'number') attrs.wordSpacing = round(attrs.wordSpacing * k);
      out[key] = attrs;
      continue;
    }
    out[key] = scaleMarks(value, k);
  }
  return out as T;
}

/** Какие блоки не помещаются на лист заданного размера. */
export function overflowingIds(layout: SheetLayout, page: PageMm): string[] {
  return layout
    .filter((el) => el.x < -1e-9 || el.y < -1e-9 || el.x + el.w > page.w + 1e-9 || el.y + el.h > page.h + 1e-9)
    .map((el) => el.id);
}

/**
 * Разрешение фона для печати — точек на дюйм при растяжении на лист.
 * Для печати нужно 300, ниже 150 картинка заметно мылит.
 */
export function backgroundDpi(image: { width: number; height: number }, page: PageMm): number {
  const dpiX = image.width / (page.w / 25.4);
  const dpiY = image.height / (page.h / 25.4);
  return Math.round(Math.min(dpiX, dpiY));
}

export const PRINT_DPI = 300;
export const POOR_DPI = 150;

/**
 * Безопасные поля печати, мм.
 *
 * Обрез — 3 мм с каждой стороны: столько снимает резак типографии,
 * и всё, что стоит ближе к краю, рискует быть срезанным. Обычный принтер
 * не печатает по краю ещё шире — 5 мм.
 */
export const BLEED_MM = 3;
export const SAFE_MARGIN_MM = 5;
