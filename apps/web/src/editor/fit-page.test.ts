import { describe, expect, it } from 'vitest';
import { fitPageToImage } from './fit-page';

/*
 * Перекошенный бланк печатается ровно так же успешно, как правильный,
 * и брак обнаруживает получатель. Поэтому расчёт проверяем: ошибка здесь
 * не даёт отказа, она даёт испорченное награждение.
 */

const A4_LANDSCAPE = { widthMm: 297, heightMm: 210 };
const A4_PORTRAIT = { widthMm: 210, heightMm: 297 };

describe('совпадение пропорций', () => {
  it('бланк тех же пропорций вопросов не вызывает', () => {
    // A4 альбомная при 300 dpi.
    const fit = fitPageToImage(A4_LANDSCAPE, { width: 3508, height: 2480 });
    expect(fit.mismatched).toBe(false);
  });

  it('расхождение в доли процента терпим', () => {
    // Типографский бланк с припуском на резку — отличается на десятые доли.
    const fit = fitPageToImage(A4_LANDSCAPE, { width: 3510, height: 2480 });
    expect(fit.mismatched).toBe(false);
  });

  it('книжный бланк на альбомном листе — расхождение', () => {
    const fit = fitPageToImage(A4_LANDSCAPE, { width: 2480, height: 3508 });
    expect(fit.mismatched).toBe(true);
  });

  it('квадратный бланк на A4 — расхождение', () => {
    const fit = fitPageToImage(A4_LANDSCAPE, { width: 2000, height: 2000 });
    expect(fit.mismatched).toBe(true);
  });
});

describe('предложенный размер', () => {
  it('у альбомного листа оставляет ширину, пересчитывает высоту', () => {
    const fit = fitPageToImage(A4_LANDSCAPE, { width: 2000, height: 1500 });
    expect(fit.suggested).toEqual({ widthMm: 297, heightMm: 223 });
  });

  it('у книжного листа оставляет высоту, пересчитывает ширину', () => {
    const fit = fitPageToImage(A4_PORTRAIT, { width: 1500, height: 2000 });
    expect(fit.suggested).toEqual({ widthMm: 223, heightMm: 297 });
  });

  it('квадратный бланк даёт квадратный лист', () => {
    const fit = fitPageToImage(A4_LANDSCAPE, { width: 1000, height: 1000 });
    expect(fit.suggested).toEqual({ widthMm: 297, heightMm: 297 });
  });

  it('очень вытянутый бланк не сжимает лист в ничто', () => {
    // Иначе получился бы лист высотой в доли миллиметра.
    const fit = fitPageToImage(A4_LANDSCAPE, { width: 10000, height: 100 });
    expect(fit.suggested.heightMm).toBeGreaterThanOrEqual(10);
  });

  it('миллиметры целые', () => {
    const fit = fitPageToImage(A4_LANDSCAPE, { width: 1337, height: 977 });
    expect(Number.isInteger(fit.suggested.widthMm)).toBe(true);
    expect(Number.isInteger(fit.suggested.heightMm)).toBe(true);
  });
});
