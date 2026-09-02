import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Browser } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { measureLine, measureRuns, type StyledRun, type TextStyle } from '@gramota/shared/fonts';

/*
 * Сверка измерения с настоящим Chromium.
 *
 * Весь смысл проверки списка держится на одном допущении: что мы умеем
 * посчитать ширину строки так же, как посчитает её браузер при печати.
 * Подтверждает это допущение только вот этот файл — поэтому он и живёт
 * рядом с проверкой, а не среди чистых функций.
 *
 * Проверяем два разных обещания, и это не одно и то же:
 *
 *  — «estimate» обязан быть близок к браузеру. Это ответ на вопрос
 *    «сколько места займёт текст»;
 *  — «safe» обязан быть не уже браузера. Это ответ на вопрос «влезет ли»,
 *    и ошибаться он вправе только в сторону лишнего предупреждения.
 *    Занижение здесь означает «сказали, что влезет», а на печати обрезало —
 *    и заметит это уже получатель.
 *
 * Расхождение берётся из кернинга и вязи: ширина строки не равна сумме
 * ширин её букв. Систематическую часть снимает поправка из metrics.json,
 * остаётся разброс от строки к строке — у наборных шрифтов доли процента,
 * у рукописных единицы процентов.
 */

const FONTS_DIR = join(__dirname, '../../../web/public/fonts');
const SIZE_PX = 100;

/**
 * Насколько «estimate» вправе разойтись с браузером.
 *
 * У рукописных запас больше не из снисходительности: там буквы
 * подменяются связными вариантами, и ширина строки перестаёт зависеть
 * от ширин букв по отдельности. Замерено на этих же пробах: наборные
 * укладываются в 0,83%, рукописные в 4,02%.
 */
const ESTIMATE_TOLERANCE = 0.015;
const ESTIMATE_TOLERANCE_SCRIPT = 0.05;

/**
 * Насколько «safe» вправе оказаться уже браузера. Практически нисколько:
 * запас оставлен только под погрешность самого сравнения.
 */
const SAFE_UNDERSHOOT = 0.001;

/** Рукописные: у них вязь, и разброс принципиально другой. */
const SCRIPT_FAMILIES = new Set(['Caveat', 'Marck Script']);

interface Sample {
  text: string;
  family: string;
  bold?: boolean;
  italic?: boolean;
}

/**
 * Пробы — тот текст, который печатается на грамотах: русские ФИО,
 * названия мероприятий, города и даты. Проверять кернинг латинского
 * капслока смысла нет: в наградных документах его не бывает.
 */
const SAMPLES: Sample[] = [
  { text: 'Иванов Пётр Ильич', family: 'PT Sans' },
  { text: 'Константинопольский Владислав Вячеславович', family: 'PT Sans' },
  { text: 'Награждается', family: 'PT Sans' },
  { text: 'Награждается', family: 'PT Sans', bold: true },
  { text: 'Иванову Петру Ильичу', family: 'PT Sans', bold: true },
  { text: 'Щёголев Юрий Аркадьевич', family: 'PT Serif' },
  { text: 'Мамедова Айгюль Ильгаровна', family: 'PT Serif', bold: true },
  { text: 'Первенство области по плаванию', family: 'Montserrat' },
  { text: 'Первенство области по плаванию', family: 'Montserrat', bold: true },
  { text: 'Ким Ён Ха', family: 'Lora' },
  { text: 'Абрамов-Полянский Ъ Ы Ё', family: 'Inter' },
  { text: 'Сертификат участника', family: 'Inter' },
  { text: 'Диплом за первое место', family: 'Playfair Display', italic: true },
  { text: 'Сертификат участника', family: 'Caveat' },
  { text: 'Сертификат участника', family: 'Caveat', bold: true },
  { text: 'Благодарственное письмо', family: 'Marck Script' },
  { text: 'г. Челябинск, 17 июня 2026 года', family: 'PT Sans' },
  { text: 'Ivanov Peter', family: 'PT Sans' },
  { text: 'Certificate of Completion', family: 'Montserrat' },
];

function styleFor(sample: Sample): TextStyle {
  return {
    fontFamily: sample.family,
    // Меряем в пунктах, а браузер в пикселях — переводим через ту же
    // константу CSS, по которой считается и сам лист.
    fontSize: (SIZE_PX * 72) / 96,
    bold: sample.bold ?? false,
    italic: sample.italic ?? false,
    lineHeight: 1.2,
    letterSpacing: 0,
    uppercase: false,
    strokeWidth: 0,
  };
}

/**
 * Строки из нескольких прогонов.
 *
 * Меряются не холстом, а настоящей строкой из `span`: холст умеет один
 * шрифт на вызов, а расхождение с прогонами возникает как раз на стыке —
 * кернинг между последней буквой одного прогона и первой другого
 * браузер не считает, а мы и подавно. Этот стык и проверяем.
 */
const RUN_SAMPLES: { name: string; runs: StyledRun[] }[] = [
  {
    name: 'PT Serif: полужирная фамилия',
    runs: [
      { text: 'Иванов', style: styleOf('PT Serif', { bold: true }) },
      { text: ' Пётр Ильич', style: styleOf('PT Serif') },
    ],
  },
  {
    name: 'PT Sans: слово крупнее строки',
    runs: [
      { text: 'за ', style: styleOf('PT Sans') },
      { text: 'первое', style: { ...styleOf('PT Sans', { bold: true }), fontSize: SIZE_PX * 1.5 * (72 / 96) } },
      { text: ' место', style: styleOf('PT Sans') },
    ],
  },
  {
    name: 'Montserrat: разрядка и курсив',
    runs: [
      { text: 'ДИПЛОМ', style: { ...styleOf('Montserrat', { bold: true }), letterSpacing: 2 } },
      { text: ' участника', style: styleOf('Montserrat', { italic: true }) },
    ],
  },
  {
    name: 'наборная с рукописной вставкой',
    runs: [
      { text: 'Награждается ', style: styleOf('PT Sans') },
      { text: 'Иванов Пётр', style: styleOf('Caveat') },
    ],
  },
  {
    name: 'три гарнитуры подряд',
    runs: [
      { text: 'Сертификат ', style: styleOf('Playfair Display', { italic: true }) },
      { text: 'участника ', style: styleOf('Inter') },
      { text: 'первенства', style: styleOf('Lora', { bold: true }) },
    ],
  },
];

function styleOf(family: string, over: Partial<TextStyle> = {}): TextStyle {
  return {
    fontFamily: family,
    fontSize: (SIZE_PX * 72) / 96,
    bold: false,
    italic: false,
    lineHeight: 1.2,
    letterSpacing: 0,
    uppercase: false,
    strokeWidth: 0,
    ...over,
  };
}

const FAMILY_BY_SLUG: Record<string, string> = {
  'pt-sans': 'PT Sans',
  'pt-serif': 'PT Serif',
  inter: 'Inter',
  montserrat: 'Montserrat',
  lora: 'Lora',
  'playfair-display': 'Playfair Display',
  caveat: 'Caveat',
  'marck-script': 'Marck Script',
};

/** Правила @font-face со шрифтами, вшитыми прямо в страницу. */
function faceRules(): string {
  const rules: string[] = [];

  for (const file of readdirSync(FONTS_DIR).filter((f) => f.endsWith('.woff2'))) {
    const match = file.match(
      /^(.+?)-(\d{3})-(normal|italic)-(?:cyrillic|latin)(?:-ext)?\.[0-9a-f]{8}\.woff2$/,
    );
    if (!match) continue;
    const [, slug, weight, style] = match;
    const family = FAMILY_BY_SLUG[slug];
    if (!family) continue;

    // Через data-URL, а не file://: страница, собранная setContent, живёт
    // в непрозрачном источнике и в файлы на диске ходить не вправе.
    const data = readFileSync(join(FONTS_DIR, file)).toString('base64');
    rules.push(
      `@font-face{font-family:'${family}';font-weight:${weight};font-style:${style};` +
        `src:url('data:font/woff2;base64,${data}') format('woff2');}`,
    );
  }

  return rules.join('\n');
}

/**
 * Тесты с настоящим браузером идут только по явному требованию.
 *
 *   CHROMIUM_TESTS=1 pnpm --filter @gramota/server test
 *
 * Им нужен Chromium и шрифты в apps/web/public/fonts, а обычный `pnpm -r test`
 * гоняют и там, где ни того, ни другого нет: на свежем клоне до установки
 * браузеров Playwright, в чужом CI. Падение из-за отсутствия окружения
 * ничего не сообщает о коде и только приучает не доверять красным тестам.
 *
 * Пропускать молча тоже нельзя, поэтому имя флага стоит в README рядом
 * с командой предкоммитной проверки.
 */
const CHROMIUM_TESTS = process.env.CHROMIUM_TESTS === '1';

describe.skipIf(!CHROMIUM_TESTS)('измерение против Chromium', () => {
  let browser: Browser;
  let chromiumWidths: number[];
  let chromiumRunWidths: number[];

  beforeAll(async () => {
    browser = await chromium.launch({
      channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });
    const page = await browser.newPage();
    await page.setContent(`<style>${faceRules()}</style><body>измерение</body>`);

    chromiumWidths = await page.evaluate(
      async ({ samples, sizePx }) => {
        const canvas = document.createElement('canvas').getContext('2d')!;
        const out: number[] = [];

        for (const s of samples) {
          const weight = s.bold ? 700 : 400;
          const style = s.italic ? 'italic' : 'normal';
          const font = `${style} ${weight} ${sizePx}px "${s.family}"`;
          await document.fonts.load(font, s.text);
          // Не загрузившийся шрифт мерился бы подменным, и сверка молча
          // сравнивала бы нас не с тем.
          if (!document.fonts.check(font, s.text)) {
            out.push(Number.NaN);
            continue;
          }
          canvas.font = font;
          out.push(canvas.measureText(s.text).width);
        }

        return out;
      },
      { samples: SAMPLES, sizePx: SIZE_PX },
    );

    chromiumRunWidths = await page.evaluate(
      async ({ samples }) => {
        const out: number[] = [];
        for (const sample of samples) {
          const line = document.createElement('span');
          line.style.whiteSpace = 'pre';
          for (const run of sample.runs) {
            const font =
              `${run.style.italic ? 'italic' : 'normal'} ${run.style.bold ? 700 : 400} ` +
              `${(run.style.fontSize * 96) / 72}px "${run.style.fontFamily}"`;
            await document.fonts.load(font, run.text);
            if (!document.fonts.check(font, run.text)) {
              out.push(Number.NaN);
              line.remove();
              break;
            }
            const span = document.createElement('span');
            span.style.font = font;
            span.style.letterSpacing = `${run.style.letterSpacing}pt`;
            span.textContent = run.text;
            line.appendChild(span);
          }
          if (!line.isConnected && out.length && Number.isNaN(out[out.length - 1])) continue;
          document.body.appendChild(line);
          out.push(line.getBoundingClientRect().width);
          line.remove();
        }
        return out;
      },
      { samples: RUN_SAMPLES },
    );

    await page.close();
  }, 120_000);

  afterAll(async () => {
    await browser?.close();
  });

  const runCases = RUN_SAMPLES.map((s, i) => [s.name, i] as const);

  it.each(runCases)('прогоны: %s — оценка близка к браузеру', (_name, index) => {
    const chromiumPx = chromiumRunWidths[index];
    expect(chromiumPx, 'браузер не загрузил начертание').toBeGreaterThan(0);
    const ourPx = (measureRuns(RUN_SAMPLES[index].runs, 'estimate') / 25.4) * 96;
    const scripted = RUN_SAMPLES[index].runs.some((r) => SCRIPT_FAMILIES.has(r.style.fontFamily));
    const drift = (ourPx - chromiumPx) / chromiumPx;
    expect(Math.abs(drift)).toBeLessThan(scripted ? ESTIMATE_TOLERANCE_SCRIPT : ESTIMATE_TOLERANCE);
  });

  it.each(runCases)('прогоны: %s — осторожная мера не уже браузера', (_name, index) => {
    const chromiumPx = chromiumRunWidths[index];
    expect(chromiumPx, 'браузер не загрузил начертание').toBeGreaterThan(0);
    const ourPx = (measureRuns(RUN_SAMPLES[index].runs, 'safe') / 25.4) * 96;
    expect((ourPx - chromiumPx) / chromiumPx).toBeGreaterThan(-SAFE_UNDERSHOOT);
  });

  /** Наша ширина в пикселях CSS — measureLine отдаёт миллиметры. */
  function ourWidth(sample: Sample, mode: 'estimate' | 'safe'): number {
    return (measureLine(sample.text, styleFor(sample), undefined, mode) / 25.4) * 96;
  }

  const cases = SAMPLES.map((s, i) => [`${s.family}${s.bold ? ' bold' : ''}`, s.text, i] as const);

  it.each(cases)('%s «%s» — оценка близка к браузеру', (_family, _text, index) => {
    const sample = SAMPLES[index];
    const chromiumPx = chromiumWidths[index];
    expect(chromiumPx, 'браузер не загрузил начертание').toBeGreaterThan(0);

    const drift = (ourWidth(sample, 'estimate') - chromiumPx) / chromiumPx;
    const tolerance = SCRIPT_FAMILIES.has(sample.family)
      ? ESTIMATE_TOLERANCE_SCRIPT
      : ESTIMATE_TOLERANCE;

    expect(Math.abs(drift)).toBeLessThan(tolerance);
  });

  it.each(cases)('%s «%s» — осторожная мера не уже браузера', (_family, _text, index) => {
    const sample = SAMPLES[index];
    const chromiumPx = chromiumWidths[index];
    expect(chromiumPx, 'браузер не загрузил начертание').toBeGreaterThan(0);

    /*
     * Главное обещание всей проверки. Если осторожная мера окажется уже
     * настоящей, проверка скажет «влезет» про текст, который на печати
     * обрежется, — а это ровно тот брак, ради предотвращения которого
     * она и написана.
     */
    const drift = (ourWidth(sample, 'safe') - chromiumPx) / chromiumPx;
    expect(drift).toBeGreaterThan(-SAFE_UNDERSHOOT);
  });
});
