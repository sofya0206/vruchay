import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fitText, type BoxMm, type TextStyle } from '@gramota/shared/fonts';

/*
 * Главная сверка всей функции: совпадает ли наш вердикт «влезает / обрежет»
 * с тем, что на самом деле сделает Chromium.
 *
 * Соседний measure-vs-chromium.test.ts сравнивает ширины строк — это
 * промежуточная величина. Здесь сравнивается сам ответ, ради которого
 * проверка написана, и блок собирается ровно теми правилами CSS, которыми
 * его рисует SheetRenderer: flex по центру, pre-wrap, break-word, overflow
 * hidden. Если эти правила в рендере изменятся, тест разойдётся с ним
 * и об этом станет известно здесь, а не из жалобы получателя.
 *
 * Расхождения бывают двух очень разных видов:
 *
 *  — мы сказали «обрежет», а влезло: лишнее предупреждение, стоит взгляда;
 *  — мы сказали «влезет», а обрезало: испорченная грамота.
 *
 * Второго быть не должно ни одного, и это утверждается отдельно.
 */

const FONTS_DIR = join(__dirname, '../../../web/public/fonts');

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
    const data = readFileSync(join(FONTS_DIR, file)).toString('base64');
    rules.push(
      `@font-face{font-family:'${family}';font-weight:${weight};font-style:${style};` +
        `src:url('data:font/woff2;base64,${data}') format('woff2');}`,
    );
  }
  return rules.join('\n');
}

interface Case {
  /** Как называется блок — чтобы падение читалось без счёта по списку. */
  block: string;
  style: TextStyle;
  box: BoxMm;
  texts: string[];
}

function style(over: Partial<TextStyle>): TextStyle {
  return {
    fontFamily: 'PT Sans',
    fontSize: 18,
    bold: false,
    italic: false,
    lineHeight: 1.2,
    letterSpacing: 0,
    uppercase: false,
    strokeWidth: 0,
    ...over,
  };
}

/**
 * Блоки взяты с настоящих грамот: имя крупным кеглем в тесной рамке,
 * подзаголовок помельче, рукописная подпись. Имена — те, на которых
 * такие блоки и ломаются: длинные, двойные, с отчеством.
 */
const CASES: Case[] = [
  {
    block: 'имя, PT Serif 30pt полужирный, 207×14 мм',
    style: style({ fontFamily: 'PT Serif', fontSize: 30, bold: true }),
    box: { w: 207, h: 14 },
    texts: [
      'Иванов Пётр Ильич',
      'Петрова Мария Сергеевна',
      'Константинопольский Владислав Вячеславович',
      'Раздобудько-Незнамов Владислав',
      'Тер-Аванесян Гарри Артёмович',
      'Александропулос-Константиниди Апостолос',
      'Ким Ён Ха',
      'Ыныкчаанап Мэндиэмэн Уйбаанабыс',
    ],
  },
  {
    block: 'имя, Montserrat 24pt, 120×12 мм',
    style: style({ fontFamily: 'Montserrat', fontSize: 24 }),
    box: { w: 120, h: 12 },
    texts: [
      'Иванов Пётр',
      'Кузнецова Анна Ивановна',
      'Константинопольский Владислав Вячеславович',
      'Ким',
    ],
  },
  {
    block: 'подзаголовок, PT Sans 14pt, 237×10 мм',
    style: style({ fontSize: 14 }),
    box: { w: 237, h: 10 },
    texts: [
      'за участие в первенстве области по плаванию, г. Челябинск',
      'за многолетний добросовестный труд и значительный вклад в развитие ' +
        'физической культуры и спорта в Челябинской области',
      'Дельфин',
    ],
  },
  {
    block: 'прописными, PT Sans 20pt, 100×10 мм',
    style: style({ fontSize: 20, uppercase: true }),
    box: { w: 100, h: 10 },
    texts: ['Иванов Пётр', 'Кузнецова Анна Ивановна'],
  },
  {
    block: 'рукописный, Caveat 26pt, 90×12 мм',
    style: style({ fontFamily: 'Caveat', fontSize: 26 }),
    box: { w: 90, h: 12 },
    texts: ['Сертификат участника', 'Иванов Пётр Ильич', 'Ким'],
  },
];

/** Разрядка: её Chromium добавляет и после последней буквы. */
const SPACED: Case = {
  block: 'с разрядкой, PT Sans 18pt, 80×10 мм',
  style: style({ fontSize: 18, letterSpacing: 2 }),
  box: { w: 80, h: 10 },
  texts: ['Иванов Пётр', 'Ким Ён Ха'],
};

const ALL = [...CASES, SPACED];

interface Verdict {
  block: string;
  text: string;
  chromiumClips: boolean;
  weSayFits: boolean;
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

describe.skipIf(!CHROMIUM_TESTS)('вердикт «влезает» против настоящего Chromium', () => {
  let browser: Browser;
  const verdicts: Verdict[] = [];

  beforeAll(async () => {
    browser = await chromium.launch({
      channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });
    const page: Page = await browser.newPage();
    await page.setContent(`<style>${faceRules()}</style><body style="margin:0"><div id="host"></div></body>`);
    await page.evaluate(() => document.fonts.ready);

    for (const testCase of ALL) {
      const clipped = await page.evaluate(
        async ({ style: s, box, texts }) => {
          const host = document.getElementById('host')!;
          host.innerHTML = '';

          const el = document.createElement('div');
          /*
           * Ровно те же правила, что в apps/web/src/render/SheetRenderer.tsx.
           * Любое расхождение здесь делает весь тест бессмысленным: он начнёт
           * сверять нас не с тем, что печатается.
           */
          Object.assign(el.style, {
            position: 'absolute',
            left: '0',
            top: '0',
            width: `${box.w}mm`,
            height: `${box.h}mm`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: s.fontFamily,
            fontSize: `${s.fontSize}pt`,
            fontWeight: s.bold ? '700' : '400',
            fontStyle: s.italic ? 'italic' : 'normal',
            textTransform: s.uppercase ? 'uppercase' : 'none',
            lineHeight: String(s.lineHeight),
            letterSpacing: `${s.letterSpacing}pt`,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            overflow: 'hidden',
          });
          host.appendChild(el);

          const weight = s.bold ? 700 : 400;
          await document.fonts.load(
            `${s.italic ? 'italic' : 'normal'} ${weight} ${s.fontSize}pt "${s.fontFamily}"`,
            texts.join(''),
          );

          const out: boolean[] = [];
          for (const text of texts) {
            el.textContent = text;
            // Обрезание и есть расхождение содержимого с рамкой блока:
            // именно эти пиксели не попадут в PDF.
            out.push(
              el.scrollHeight > el.clientHeight + 0.5 || el.scrollWidth > el.clientWidth + 0.5,
            );
          }
          return out;
        },
        { style: testCase.style, box: testCase.box, texts: testCase.texts },
      );

      testCase.texts.forEach((text, i) => {
        verdicts.push({
          block: testCase.block,
          text,
          chromiumClips: clipped[i],
          weSayFits: fitText(text, testCase.style, testCase.box, false).fits,
        });
      });
    }

    await page.close();
  }, 120_000);

  afterAll(async () => {
    await browser?.close();
  });

  it('пробы охватывают оба исхода — иначе сверять было бы нечего', () => {
    expect(verdicts.some((v) => v.chromiumClips)).toBe(true);
    expect(verdicts.some((v) => !v.chromiumClips)).toBe(true);
  });

  it('ни разу не обещает «влезет» там, где Chromium обрезает', () => {
    /*
     * Единственное расхождение, которого быть не должно. Всё остальное —
     * лишнее предупреждение, оно стоит человеку одного взгляда. А это —
     * грамота с обрезанной фамилией, и заметит её получатель.
     */
    const dangerous = verdicts.filter((v) => v.weSayFits && v.chromiumClips);
    expect(
      dangerous.map((v) => `${v.block}: «${v.text}»`),
      'сказали «влезет», а Chromium обрежет',
    ).toEqual([]);
  });

  it('не перестраховывается сверх меры', () => {
    // Проверка, объявляющая брак на каждой второй строке, бесполезна
    // ровно так же, как молчащая: её перестают читать.
    const falseAlarms = verdicts.filter((v) => !v.weSayFits && !v.chromiumClips);
    expect(falseAlarms.length / verdicts.length).toBeLessThan(0.1);
  });
});
