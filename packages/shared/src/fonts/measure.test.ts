import { describe, expect, it } from 'vitest';
import {
  applyFitStepToStyle,
  CONTENT_AREA_EM,
  fitRuns,
  fitText,
  layoutRuns,
  layoutText,
  measureLine,
  measureRuns,
  MIN_AUTO_FIT_RATIO,
  ptToMm,
  resolveFace,
  wrapRuns,
  wrapText,
  type StyledRun,
  type TextStyle,
} from './measure';
import { runsOfBlocks, runsText } from './runs';
import type { ResolvedBlock } from '../schema/rich-text-resolve';

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
    // Ступень — это не только кегль: межстрочный и разрядка ужимаются вместе с ним.
    const check = layoutText('Иванов Пётр Ильич', applyFitStepToStyle(style({ fontSize: 30 }), r.fit), box);
    expect(check.heightMm).toBeLessThanOrEqual(box.h + 1e-9);
    expect(r.step).toBeGreaterThan(0);
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

/*
 * Прогоны: строка, набранная несколькими стилями.
 *
 * Главное обещание — обратная совместимость: старый макет без марок это
 * один прогон, и он обязан мериться теми же числами, что и раньше.
 * Иначе вердикты проверки списка поменялись бы у клиентов, у которых
 * в макете ничего не менялось.
 */
describe('прогоны', () => {
  const bold = style({ bold: true });

  it('один прогон меряется как строка — байт в байт', () => {
    const text = 'Награждается Иванов Пётр Ильич';
    expect(measureRuns([{ text, style: style() }])).toBe(measureLine(text, style()));
    expect(fitRuns([{ text, style: style() }], style(), { w: 60, h: 20 }, true)).toEqual(
      fitText(text, style(), { w: 60, h: 20 }, true),
    );
  });

  it('разрез строки на прогоны одного стиля не меняет ширину', () => {
    const whole = measureLine('Иванов Пётр Ильич', style());
    const parts = measureRuns([
      { text: 'Иванов ', style: style() },
      { text: 'Пётр ', style: style() },
      { text: 'Ильич', style: style() },
    ]);
    expect(parts).toBeCloseTo(whole, 9);
  });

  it('смешанная строка — сумма своих прогонов, каждый своим начертанием', () => {
    const mixed = measureRuns([{ text: 'Иванов', style: bold }, { text: ' Пётр', style: style() }]);
    expect(mixed).toBeCloseTo(measureLine('Иванов', bold) + measureLine(' Пётр', style()), 9);
    expect(mixed).not.toBeCloseTo(measureLine('Иванов Пётр', style()), 3);
  });

  it('слово, начатое в одном прогоне и законченное в другом, не рвётся на переносе', () => {
    const runs: StyledRun[] = [
      { text: 'Награждается Ива', style: style() },
      { text: 'нов', style: bold },
      { text: ' Пётр', style: style() },
    ];
    const width = measureRuns([{ text: 'Награждается Иванов', style: style() }]) + 1;
    const lines = wrapRuns(runs, width);
    expect(lines.map((l) => l.map((r) => r.text).join(''))).toEqual([
      'Награждается Иванов',
      'Пётр',
    ]);
    // Стили внутри переносов сохранились.
    expect(lines[0].map((r) => r.style.bold)).toEqual([false, true]);
  });

  it('перевод строки внутри прогона начинает новую строку', () => {
    const lines = wrapRuns(
      [{ text: 'Иванов\nПётр', style: style() }, { text: ' Ильич', style: bold }],
      1000,
    );
    expect(lines.map((l) => l.map((r) => r.text).join(''))).toEqual(['Иванов', 'Пётр Ильич']);
  });

  it('высота строки берётся по самому крупному прогону', () => {
    const small = style({ fontSize: 10 });
    const large = style({ fontSize: 30 });
    const one = layoutRuns([{ text: 'Иванов', style: small }], small, { w: 1000, h: 100 });
    const mixed = layoutRuns(
      [{ text: 'Ива', style: small }, { text: 'нов', style: large }],
      small,
      { w: 1000, h: 100 },
    );
    // Плюс хвост области глифов за строкой: при межстрочном 1,2 это 0,1 em.
    const overhang = (size: number) => ptToMm((CONTENT_AREA_EM - 1.2) * size);
    expect(one.heightMm).toBeCloseTo(ptToMm(10 * 1.2) + overhang(10), 6);
    expect(mixed.heightMm).toBeCloseTo(ptToMm(30 * 1.2) + overhang(30), 6);
  });

  it('автомасштаб уменьшает прогоны в той же пропорции, что и блок', () => {
    const large = style({ fontSize: 40 });
    const runs: StyledRun[] = [
      { text: 'Награждается ', style: style({ fontSize: 20 }) },
      { text: 'Константинопольский Владислав', style: large },
    ];
    const result = fitRuns(runs, style({ fontSize: 20 }), { w: 80, h: 40 }, true);
    expect(result.fits).toBe(true);
    expect(result.fontSize).toBeLessThan(20);
    // Кегль крупного прогона на выбранном масштабе — вдвое больше кегля блока.
    const scale = result.fontSize / 20;
    const scaled = layoutRuns(
      runs.map((r) => ({ ...r, style: { ...r.style, fontSize: r.style.fontSize * scale } })),
      style({ fontSize: result.fontSize }),
      { w: 80, h: 40 },
    );
    expect(scaled.heightMm).toBeLessThanOrEqual(40);
  });

  it('межсловный интервал добавляется к каждому пробелу', () => {
    const plain = measureLine('Иванов Пётр Ильич', style());
    const spaced = measureLine('Иванов Пётр Ильич', style({ wordSpacing: 2 }));
    expect(spaced).toBeCloseTo(plain + ptToMm(2) * 2, 9);
  });
});

describe('прогоны из марок', () => {
  const base = style();
  const block = (content: ResolvedBlock['content'], marker: string | null = null): ResolvedBlock => ({
    marker,
    align: null,
    indent: 0,
    content,
  });

  it('старый блок без марок — один прогон в стиле блока', () => {
    const runs = runsOfBlocks([block([{ type: 'text', text: 'Иванов' }])], base);
    expect(runs).toEqual([{ text: 'Иванов', style: base }]);
  });

  it('полужирная марка даёт полужирный прогон', () => {
    const runs = runsOfBlocks(
      [block([{ type: 'text', text: 'Ива' }, { type: 'text', text: 'нов', marks: [{ type: 'bold' }] }])],
      base,
    );
    expect(runs[1].style.bold).toBe(true);
    expect(runs[0].style).toBe(base);
  });

  it('кегль и гарнитура из textStyle перекрывают стиль блока', () => {
    const runs = runsOfBlocks(
      [
        block([
          {
            type: 'text',
            text: 'Иванов',
            marks: [{ type: 'textStyle', attrs: { fontSize: 30, fontFamily: 'Lora', fontWeight: 600 } }],
          },
        ]),
      ],
      base,
    );
    expect(runs[0].style).toMatchObject({ fontSize: 30, fontFamily: 'Lora', bold: true });
  });

  it('капитель меряется прописными — в сторону «шире»', () => {
    const runs = runsOfBlocks(
      [block([{ type: 'text', text: 'Иванов', marks: [{ type: 'textStyle', attrs: { transform: 'smallcaps' } }] }])],
      base,
    );
    expect(runs[0].style.uppercase).toBe(true);
  });

  it('индекс — мельче строки', () => {
    const runs = runsOfBlocks(
      [block([{ type: 'text', text: '2', marks: [{ type: 'superscript' }] }])],
      base,
    );
    expect(runs[0].style.fontSize).toBeLessThan(base.fontSize);
  });

  it('строки — через перевод строки, маркер — в начале своей строки', () => {
    const runs = runsOfBlocks(
      [block([{ type: 'text', text: 'первое' }], '1.'), block([{ type: 'text', text: 'второе' }], '2.')],
      base,
    );
    expect(runsText(runs)).toBe('1. первое\n2. второе');
  });

  it('поле меряется своим значением с марками поля', () => {
    const runs = runsOfBlocks(
      [
        block([
          {
            type: 'field',
            attrs: { source: 'name', fieldId: null, fallback: null, format: 'none' },
            marks: [{ type: 'italic' }],
            text: 'Иванов',
            state: 'ok',
          },
        ]),
      ],
      base,
    );
    expect(runs).toEqual([{ text: 'Иванов', style: { ...base, italic: true } }]);
  });
});
