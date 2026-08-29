import { createServer, type Server } from 'node:http';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Browser } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SHEET_SELECTOR, overlayProblem, probePoints } from './overlay-guard';

/*
 * Единственная проверка в проекте, которая смотрит на выпущенный PDF
 * пикселями, а не текстом.
 *
 * Заведена после блокера 28.08.2026: заставка приложения — непрозрачный
 * слой из index.html — печаталась поверх фамилии награждённого. Мимо неё
 * прошли все 979 проверок, и это не случайность, а следствие того, что
 * каждая смотрела не туда: превью в кабинете рисуется другим кодом,
 * проверка вёрстки считает ширины по метрикам шрифтов, а сквозная
 * проверка достаёт из PDF текст — он там был, просто под слоем.
 *
 * Отсюда устройство проверки: печатаем страницу так же, как это делает
 * воркер, растрируем полученный PDF и сравниваем картинку с эталоном.
 *
 * Эталон не лежит в репозитории картинкой, а печатается тут же из голой
 * разметки того же листа. Причина простая: сохранённый PNG зависит от
 * версии Chromium и сглаживания шрифтов, и через полгода такой эталон
 * начал бы падать на исправном коде — а падающую по погоде проверку
 * выключают, и дыра открывается снова. Здесь же обе картинки проходят
 * один и тот же путь, и расхождение может значить только одно: в готовый
 * документ попало то, чего нет в макете.
 */

/*
 * Проверка с настоящим браузером идёт только по явному требованию:
 *
 *   CHROMIUM_TESTS=1 pnpm --filter @gramota/web test
 *
 * Тот же флаг, что у сверки измерения с Chromium (apps/server/src/validation).
 * Обычный `pnpm -r test` гоняют и там, где браузеров Playwright нет.
 */
const CHROMIUM_TESTS = process.env.CHROMIUM_TESTS === '1';

/**
 * Канал браузера.
 *
 * Растрирование нужен полноценный Chromium: в headless shell, который
 * Playwright берёт по умолчанию, нет просмотрщика PDF — он такой файл
 * скачивает, а не показывает.
 */
const CHANNEL = process.env.PLAYWRIGHT_CHANNEL || 'chromium';

/** Лист документа: как у настоящего, в миллиметрах и в натуральную величину. */
const PAGE_WIDTH_MM = 210;
const PAGE_HEIGHT_MM = 148;
const VIEWPORT = { width: mmToPx(PAGE_WIDTH_MM), height: mmToPx(PAGE_HEIGHT_MM) };

/**
 * Задержка выдачи кода приложения.
 *
 * Не выдумка для строгости, а замер с боевой сборки: 787 КБ кода
 * приезжают дольше трети секунды, после которой заставка начинает
 * проявляться. Без этой задержки заставка не успевает стать видимой,
 * проверка зеленеет на сломанном коде — и мы получаем ровно тот тест,
 * из-за которого дефект и доехал до людей.
 */
const APP_DELAY_MS = 500;

/** Разметка листа — одна и та же для страницы печати и для эталона. */
function sheetHtml(background: boolean): string {
  return `
    <div data-sheet style="position:relative;width:${PAGE_WIDTH_MM}mm;height:${PAGE_HEIGHT_MM}mm;background:#fff;overflow:hidden">
      ${background ? '<img src="/background.svg" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover">' : ''}
      <div style="position:absolute;left:20mm;top:55mm;font:700 34px Georgia,serif;color:#111">Иванов Пётр Ильич</div>
      <div style="position:absolute;left:20mm;top:75mm;font:400 18px Georgia,serif;color:#333">Первенство области по плаванию</div>
    </div>`;
}

/**
 * Заглушка приложения: делает ровно то, что делает RenderPage, — рисует
 * лист, проверяет, что поверх него ничего нет, и объявляет готовность.
 * Настоящий React здесь не нужен: проверяется оболочка index.html,
 * а она про приложение знает только то, что оно когда-то запустится.
 *
 * Проверку слоя не переписываем, а вставляем ту самую, что стоит
 * в RenderPage: переписанная копия проверяла бы саму себя.
 */
function appScript(background: boolean): string {
  return `
    const SHEET_SELECTOR = ${JSON.stringify(SHEET_SELECTOR)};
    ${overlayProblem.toString()}
    ${probePoints.toString()}
    document.body.style.margin = '0';
    document.getElementById('root').innerHTML = ${JSON.stringify(sheetHtml(background))};
    const images = [...document.images].map((img) =>
      img.complete ? Promise.resolve() : new Promise((r) => {
        img.addEventListener('load', r, { once: true });
        img.addEventListener('error', r, { once: true });
      }));
    Promise.all([document.fonts.ready, ...images]).then(() => {
      const sheet = document.querySelector('[data-sheet]');
      const points = sheet
        ? probePoints(sheet.getBoundingClientRect(), { width: innerWidth, height: innerHeight })
        : [];
      const overlay = overlayProblem(document, points);
      if (overlay) window.__RENDER_ERROR__ = 'Лист закрыт посторонним слоем: ' + overlay;
      else window.__RENDER_READY__ = true;
    });
  `;
}

/** Эталон: тот же лист и ничего кроме него. */
function etalonHtml(background: boolean): string {
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><style>body{margin:0}</style></head><body>${sheetHtml(background)}</body></html>`;
}

/**
 * Фон «из хранилища»: отдаётся с задержкой, как настоящий объект из S3.
 * Задержка здесь не для правдоподобия — она сдвигает момент готовности
 * страницы, а вместе с ним и окно, в котором заставка успевает проявиться.
 */
const BACKGROUND_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="700">' +
  '<rect width="1000" height="700" fill="#eef3ec"/>' +
  '<circle cx="500" cy="350" r="260" fill="#d6e4d6"/>' +
  '<rect x="30" y="30" width="940" height="640" fill="none" stroke="#1f5d3f" stroke-width="8"/>' +
  '</svg>';

function mmToPx(mm: number): number {
  return Math.round((mm * 96) / 25.4);
}

/** Отдаёт настоящий index.html под адресом /render — как это делает прод. */
function startSite(shell: string): Promise<{ server: Server; origin: string }> {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://site');
    const background = url.searchParams.get('bg') === '1';
    const send = (type: string, body: string, delay = 0) =>
      setTimeout(() => {
        res.writeHead(200, { 'content-type': type });
        res.end(body);
      }, delay);

    if (url.pathname === '/render') {
      // Точка входа подменена на заглушку: настоящий main.tsx без Vite
      // не выполнить, а проверяем мы оболочку, а не React.
      send('text/html; charset=utf-8', shell.replace('/src/main.tsx', `/app.js?bg=${background ? 1 : 0}`));
    } else if (url.pathname === '/app.js') {
      send('text/javascript; charset=utf-8', appScript(background), APP_DELAY_MS);
    } else if (url.pathname === '/etalon') {
      send('text/html; charset=utf-8', etalonHtml(background));
    } else if (url.pathname === '/background.svg') {
      send('image/svg+xml', BACKGROUND_SVG, 120);
    } else {
      res.writeHead(404).end();
    }
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      resolve({ server, origin: `http://127.0.0.1:${port}` });
    });
  });
}

describe.skipIf(!CHROMIUM_TESTS)('выпущенный PDF глазами', () => {
  let browser: Browser;
  let site: { server: Server; origin: string };

  beforeAll(async () => {
    const shell = readFileSync(join(__dirname, '../../index.html'), 'utf8');
    site = await startSite(shell);
    browser = await chromium.launch({ channel: CHANNEL, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  }, 120_000);

  afterAll(async () => {
    await browser?.close();
    site?.server.close();
  });

  /** Печатает страницу тем же способом, что воркер: по флагу готовности. */
  async function printRender(path: string): Promise<Buffer> {
    const page = await browser.newPage({ viewport: VIEWPORT });
    try {
      await page.goto(`${site.origin}${path}`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(
        () => window.__RENDER_READY__ === true || Boolean(window.__RENDER_ERROR__),
        undefined,
        { timeout: 15_000 },
      );
      const error = await page.evaluate(() => window.__RENDER_ERROR__);
      if (error) throw new Error(`страница печати отказалась печатать: ${error}`);
      return await page.pdf({
        width: `${PAGE_WIDTH_MM}mm`,
        height: `${PAGE_HEIGHT_MM}mm`,
        printBackground: true,
        margin: { top: '0', right: '0', bottom: '0', left: '0' },
      });
    } finally {
      await page.close().catch(() => undefined);
    }
  }

  /** Эталон печатается тем же браузером и с теми же настройками страницы. */
  async function printEtalon(path: string): Promise<Buffer> {
    const page = await browser.newPage({ viewport: VIEWPORT });
    try {
      await page.goto(`${site.origin}${path}`, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      return await page.pdf({
        width: `${PAGE_WIDTH_MM}mm`,
        height: `${PAGE_HEIGHT_MM}mm`,
        printBackground: true,
        margin: { top: '0', right: '0', bottom: '0', left: '0' },
      });
    } finally {
      await page.close().catch(() => undefined);
    }
  }

  /**
   * Растрирование PDF: файл открывается встроенным просмотрщиком Chromium
   * (это PDFium — тот же движок, которым документ увидит получатель)
   * и снимается картинкой.
   */
  async function rasterize(pdf: Buffer): Promise<number[]> {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    try {
      await page.goto(
        `data:application/pdf;base64,${pdf.toString('base64')}#toolbar=0&navpanes=0`,
        { waitUntil: 'load' },
      );
      // Просмотрщик рисует страницу не сразу: он сначала разбирает файл.
      await page.waitForTimeout(1500);
      const shot = await page.screenshot();
      return await decodePng(shot);
    } finally {
      await page.close().catch(() => undefined);
    }
  }

  /** Пиксели PNG. Декодирует сам браузер — заводить ради этого зависимость незачем. */
  async function decodePng(png: Buffer): Promise<number[]> {
    const page = await browser.newPage();
    try {
      return await page.evaluate(async (base64: string) => {
        const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
        const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(bitmap, 0, 0);
        return [...ctx.getImageData(0, 0, bitmap.width, bitmap.height).data];
      }, png.toString('base64'));
    } finally {
      await page.close().catch(() => undefined);
    }
  }

  /**
   * Доля различающихся пикселей.
   *
   * Допуск на канал маленький: фон заставки #fbfaf7 отличается от белого
   * листа всего на несколько единиц, и щедрый допуск не заметил бы,
   * что весь документ залит чужим слоем.
   */
  function difference(a: number[], b: number[]): number {
    expect(a.length).toBe(b.length);
    let differing = 0;
    for (let i = 0; i < a.length; i += 4) {
      if (
        Math.abs(a[i] - b[i]) > 3 ||
        Math.abs(a[i + 1] - b[i + 1]) > 3 ||
        Math.abs(a[i + 2] - b[i + 2]) > 3
      ) {
        differing++;
      }
    }
    return differing / (a.length / 4);
  }

  /**
   * Порог не нулевой: PDFium сглаживает края букв, и один и тот же текст
   * на двух прогонах может разойтись единичными пикселями. Полпроцента —
   * это заведомо меньше любого постороннего слоя: самая скромная беда,
   * зелёный значок заставки, занимает больше двух процентов листа.
   */
  const ALLOWED = 0.005;

  it('макет без фоновой картинки печатается ровно тем, что в макете', async () => {
    const actual = await rasterize(await printRender('/render'));
    const etalon = await rasterize(await printEtalon('/etalon'));
    expect(difference(actual, etalon)).toBeLessThan(ALLOWED);
  }, 120_000);

  it('макет с фоном из хранилища печатается ровно тем, что в макете', async () => {
    const actual = await rasterize(await printRender('/render?bg=1'));
    const etalon = await rasterize(await printEtalon('/etalon?bg=1'));
    expect(difference(actual, etalon)).toBeLessThan(ALLOWED);
  }, 120_000);
});

declare global {
  interface Window {
    __RENDER_READY__?: boolean;
    __RENDER_ERROR__?: string;
  }
}
