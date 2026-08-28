import { describe, expect, it } from 'vitest';
import {
  fitText,
  layoutText,
  measureLine,
  MIN_AUTO_FIT_RATIO,
  ptToMm,
  resolveFace,
  wrapText,
  type TextStyle,
} from './measure';

/*
 * Измерение текста без браузера.
 *
 * Числа здесь — не «что вернула функция вчера», а поведение, на которое
 * опирается проверка списка перед выпуском. Сверка с настоящим Chromium
 * живёт отдельно, в apps/server: сюда браузер тянуть незачем.
 */

function style(over: Partial<TextStyle> = {}): TextStyle {
  return {
    fontFamily: 'PT Sans',
    fontSize: 16,
    bold: false,
    italic: false,
    lineHeight: 1.2,
    letterSpacing: 0,
    uppercase: false,
    strokeWidth: 0,
    ...over,
  };
}

describe('ширина строки', () => {
  it('пустая строка ничего не занимает', () => {
    expect(measureLine('', style())).toBe(0);
  });

  it('растёт пропорционально кеглю', () => {
    const small = measureLine('Иванов', style({ fontSize: 10 }));
    const large = measureLine('Иванов', style({ fontSize: 20 }));
    expect(large).toBeCloseTo(small * 2, 6);
  });

  it('длинная фамилия шире короткой', () => {
    expect(measureLine('Константинопольский', style())).toBeGreaterThan(
      measureLine('Ким', style()),
    );
  });

  it('прописные шире строчных', () => {
    expect(measureLine('иванов', style({ uppercase: true }))).toBeGreaterThan(
      measureLine('иванов', style()),
    );
  });

  it('полужирное меряется своим начертанием, а не обычным', () => {
    /*
     * Именно «своим», а не «шире»: у PT Sans полужирная «И» уже обычной
     * (666 против 681), и на коротких словах полужирная строка выходит
     * даже чуть короче. Проверять «шире» значило бы проверять нашу догадку
     * о шрифте вместо самого шрифта.
     */
    const regular = resolveFace({ fontFamily: 'PT Sans', bold: false, italic: false }).metrics;
    const bold = resolveFace({ fontFamily: 'PT Sans', bold: true, italic: false }).metrics;
    const code = 'И'.codePointAt(0)!;
    expect(bold.widths.get(code)).not.toBe(regular.widths.get(code));
  });

  it('разрядка добавляется после каждой буквы, включая последнюю', () => {
    const plain = measureLine('Иванов', style());
    const spaced = measureLine('Иванов', style({ letterSpacing: 1 }));
    expect(spaced - plain).toBeCloseTo(ptToMm(1) * 6, 6);
  });

  it('«ё» и «й» известны — иначе половина имён мерилась бы подменой', () => {
    const face = resolveFace({ fontFamily: 'PT Sans', bold: false, italic: false }).metrics;
    for (const ch of 'ёЁйЙъЪыЫ№') {
      expect(face.widths.has(ch.codePointAt(0)!)).toBe(true);
    }
  });

  it('незнакомый символ меряется подменной шириной, а не нулём', () => {
    expect(measureLine('漢', style())).toBeGreaterThan(0);
  });
});

describe('перенос по словам', () => {
  it('короткий текст остаётся одной строкой', () => {
    expect(wrapText('Иванов Пётр', style(), 100)).toEqual(['Иванов Пётр']);
  });

  it('переводы строк из текста сохраняются', () => {
    expect(wrapText('первая\nвторая', style(), 100)).toEqual(['первая', 'вторая']);
  });

  it('пустая строка внутри текста не теряется', () => {
    expect(wrapText('а\n\nб', style(), 100)).toEqual(['а', '', 'б']);
  });

  it('текст переносится по пробелам, когда не влезает', () => {
    const lines = wrapText('Иванов Пётр Ильич', style(), 20);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join(' ')).toBe('Иванов Пётр Ильич');
  });

  it('слово длиннее блока рвётся посреди слова', () => {
    const lines = wrapText('Константинопольский', style(), 15);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join('')).toBe('Константинопольский');
  });

  it('символ шире блока не уводит перенос в бесконечный цикл', () => {
    const lines = wrapText('Ш', style({ fontSize: 40 }), 1);
    expect(lines).toEqual(['Ш']);
  });
});

describe('помещается ли в блок', () => {
  it('короткое имя в просторном блоке помещается', () => {
    const r = fitText('Ким', style(), { w: 100, h: 20 }, false);
    expect(r.fits).toBe(true);
    expect(r.lines).toBe(1);
    expect(r.fontSize).toBe(16);
  });

  it('без автомасштаба длинное имя в узком блоке не помещается', () => {
    const r = fitText(
      'Константинопольский Владислав Вячеславович',
      style(),
      { w: 40, h: 8 },
      false,
    );
    expect(r.fits).toBe(false);
    expect(r.overflowRatio).toBeGreaterThan(1);
  });

  it('автомасштаб уменьшает кегль, пока текст не влезет', () => {
    const box = { w: 60, h: 10 };
    const text = 'Константинопольский Владислав';
    expect(fitText(text, style(), box, false).fits).toBe(false);

    const scaled = fitText(text, style(), box, true);
    expect(scaled.fits).toBe(true);
    expect(scaled.fontSize).toBeLessThan(16);
    expect(scaled.heightMm).toBeLessThanOrEqual(box.h);
  });

  it('автомасштаб не опускается ниже половины кегля', () => {
    const r = fitText(
      'Константинопольский Владислав Вячеславович',
      style({ fontSize: 20 }),
      { w: 15, h: 6 },
      true,
    );
    expect(r.fits).toBe(false);
    expect(r.fontSize).toBeGreaterThanOrEqual(20 * MIN_AUTO_FIT_RATIO);
  });

  it('подобранный кегль действительно помещается — не только по отчёту', () => {
    const box = { w: 50, h: 12 };
    const r = fitText('Иванов Пётр Ильич', style({ fontSize: 30 }), box, true);
    expect(r.fits).toBe(true);
    const check = layoutText('Иванов Пётр Ильич', style({ fontSize: r.fontSize }), box);
    expect(check.heightMm).toBeLessThanOrEqual(box.h + 1e-9);
  });

  it('обводка съедает место в блоке', () => {
    const box = { w: 30, h: 8 };
    const plain = layoutText('Иванов Пётр', style(), box);
    const stroked = layoutText('Иванов Пётр', style({ strokeWidth: 2 }), box);
    expect(stroked.heightMm).toBeGreaterThanOrEqual(plain.heightMm);
  });

  it('высота блока считается по числу строк и межстрочному', () => {
    const r = layoutText('одна\nдве\nтри', style({ fontSize: 12, lineHeight: 1.5 }), {
      w: 100,
      h: 100,
    });
    expect(r.lines).toHaveLength(3);
    expect(r.heightMm).toBeCloseTo(ptToMm(12 * 1.5) * 3, 6);
  });
});

describe('подбор начертания', () => {
  it('известное семейство берётся точно', () => {
    expect(resolveFace({ fontFamily: 'PT Sans', bold: true, italic: true }).substituted).toBe(false);
  });

  it('у рукописного нет курсива — берём ближайшее и говорим об этом', () => {
    // Chromium в этом случае рисует поддельный курсив, который шире
    // настоящего, поэтому измерение занижено и предупреждать обязательно.
    const r = resolveFace({ fontFamily: 'Marck Script', bold: false, italic: true });
    expect(r.substituted).toBe(true);
  });

  it('неизвестное семейство не роняет измерение', () => {
    const r = resolveFace({ fontFamily: 'Неведомый шрифт', bold: false, italic: false });
    expect(r.substituted).toBe(true);
    expect(r.metrics.unitsPerEm).toBeGreaterThan(0);
  });
});
