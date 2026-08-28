import { createServer, type Server } from 'node:http';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Browser } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hideSplash } from './hide-splash';
import { SHEET_SELECTOR, overlayProblem, probePoints } from './overlay-guard';

/*
 * Заставка в настоящем браузере.
 *
 * Растровая проверка рядом (pdf-visual.test.ts) смотрит на итог —
 * на выпущенный PDF. Здесь проверяется механика, из-за которой этот
 * итог однажды оказался испорченным:
 *
 *  — на странице печати узла заставки не существует, как бы медленно
 *    ни приезжало приложение;
 *  — страховка страницы печати ловит заставку, если она всё-таки
 *    появилась, и не даёт напечатать испорченный документ;
 *  — в кабинете заставка по-прежнему уходит плавно — и уходит,
 *    а не доживает до страховочного таймера.
 *
 * Последнее и было отказом: анимация появления объявлена с `forwards`,
 * она удерживает прозрачность, инлайновый стиль её не перебивает,
 * переход не начинается и `transitionend` не наступает никогда.
 * Проверка на это смотрит прямо: через 150 мс после ухода заставка
 * обязана быть уже полупрозрачной.
 */

const CHROMIUM_TESTS = process.env.CHROMIUM_TESTS === '1';
const CHANNEL = process.env.PLAYWRIGHT_CHANNEL || undefined;

/** Столько же, сколько в растровой проверке: 787 КБ кода едут дольше трети секунды. */
const APP_DELAY_MS = 500;

const SHEET =
  '<div data-sheet style="position:relative;width:210mm;height:148mm;background:#fff">' +
  '<div style="position:absolute;left:20mm;top:55mm;font:700 34px Georgia,serif">Иванов Пётр Ильич</div>' +
  '</div>';

/**
 * Заглушка приложения для страницы печати: рисует лист и объявляет
 * готовность сразу — то есть в самый неудобный для заставки момент.
 *
 * Проверку слоя берём ту самую, что стоит в RenderPage: переписанная
 * копия проверяла бы саму себя.
 */
const RENDER_APP = `
  const SHEET_SELECTOR = ${JSON.stringify(SHEET_SELECTOR)};
  ${overlayProblem.toString()}
  ${probePoints.toString()}
  document.body.style.margin = '0';
  document.getElementById('root').innerHTML = ${JSON.stringify(SHEET)};
  window.__SPLASH_AT_READY__ = Boolean(document.getElementById('splash'));
  const sheet = document.querySelector(SHEET_SELECTOR);
  const points = sheet
    ? probePoints(sheet.getBoundingClientRect(), { width: innerWidth, height: innerHeight })
    : [];
  const overlay = overlayProblem(document, points);
  if (overlay) window.__RENDER_ERROR__ = 'Лист закрыт посторонним слоем: ' + overlay;
  else window.__RENDER_READY__ = true;
`;

/** Заглушка кабинета: рисует что-нибудь и убирает заставку тем же кодом, что и main.tsx. */
const APP_SHELL = `
  ${hideSplash.toString()}
  document.getElementById('root').innerHTML = '<h1>Кабинет</h1>';
  hideSplash();
  window.__HIDDEN_AT__ = performance.now();
`;

function startSite(shell: string): Promise<{ server: Server; origin: string }> {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://site');
    const send = (type: string, body: string, delay = 0) =>
      setTimeout(() => {
        res.writeHead(200, { 'content-type': type });
        res.end(body);
      }, delay);

    if (url.pathname === '/render' || url.pathname === '/') {
      const app = url.pathname === '/render' ? '/render-app.js' : '/shell-app.js';
      let html = shell.replace('/src/main.tsx', app);
      // Сборка без страховки в разметке: так выглядел бы возврат дефекта.
      if (url.searchParams.get('unguarded') === '1') {
        html = html.replace(/<script>[\s\S]*?<\/script>/, '');
      }
      send('text/html; charset=utf-8', html);
    } else if (url.pathname === '/render-app.js') {
      send('text/javascript; charset=utf-8', RENDER_APP, APP_DELAY_MS);
    } else if (url.pathname === '/shell-app.js') {
      send('text/javascript; charset=utf-8', APP_SHELL, APP_DELAY_MS);
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

describe.skipIf(!CHROMIUM_TESTS)('заставка и страница печати', () => {
  let browser: Browser;
  let site: { server: Server; origin: string };

  beforeAll(async () => {
    site = await startSite(readFileSync(join(__dirname, '../../index.html'), 'utf8'));
    browser = await chromium.launch({
      channel: CHANNEL,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });
  }, 120_000);

  afterAll(async () => {
    await browser?.close();
    site?.server.close();
  });

  it('на странице печати заставки нет к моменту готовности', async () => {
    const page = await browser.newPage({ viewport: { width: 794, height: 559 } });
    try {
      await page.goto(`${site.origin}/render`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.__RENDER_READY__ === true, undefined, {
        timeout: 15_000,
      });
      // Спрашиваем не «есть ли она сейчас», а «была ли она в тот миг,
      // когда воркер получил разрешение печатать».
      expect(await page.evaluate(() => window.__SPLASH_AT_READY__)).toBe(false);
    } finally {
      await page.close();
    }
  }, 60_000);

  it('заставка не возвращается и на очень медленной отдаче', async () => {
    const page = await browser.newPage({ viewport: { width: 794, height: 559 } });
    try {
      // Отдачу кода душим втрое сильнее обычного: ровно так дефект
      // и проявлялся — чем медленнее страница, тем чаще беда.
      await page.route('**/render-app.js', async (route) => {
        await new Promise((r) => setTimeout(r, 1500));
        await route.continue();
      });
      await page.goto(`${site.origin}/render`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.__RENDER_READY__ === true, undefined, {
        timeout: 20_000,
      });
      expect(await page.evaluate(() => window.__SPLASH_AT_READY__)).toBe(false);
      expect(await page.evaluate(() => Boolean(document.getElementById('splash')))).toBe(false);
    } finally {
      await page.close();
    }
  }, 60_000);

  it('вернувшийся дефект не печатается, а становится внятной ошибкой', async () => {
    const page = await browser.newPage({ viewport: { width: 794, height: 559 } });
    try {
      // Оболочка без страховки в разметке — так выглядела бы сборка,
      // из которой правку однажды потеряют.
      await page.goto(`${site.origin}/render?unguarded=1`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(
        () => window.__RENDER_READY__ === true || Boolean(window.__RENDER_ERROR__),
        undefined,
        { timeout: 15_000 },
      );
      // Заставка на месте — и печать не состоялась.
      expect(await page.evaluate(() => window.__SPLASH_AT_READY__)).toBe(true);
      expect(await page.evaluate(() => window.__RENDER_READY__)).not.toBe(true);
      expect(await page.evaluate(() => window.__RENDER_ERROR__)).toContain('заставка');
    } finally {
      await page.close();
    }
  }, 60_000);

  it('в кабинете заставка остаётся: она там полезна', async () => {
    const page = await browser.newPage();
    try {
      await page.goto(`${site.origin}/`, { waitUntil: 'domcontentloaded' });
      // Разметка ещё разбирается, приложение не приехало — заставка на месте.
      expect(await page.evaluate(() => Boolean(document.getElementById('splash')))).toBe(true);
    } finally {
      await page.close();
    }
  }, 60_000);

  it('в кабинете заставка уходит переходом, а не по страховочному таймеру', async () => {
    const page = await browser.newPage();
    try {
      await page.goto(`${site.origin}/`, { waitUntil: 'load' });
      await page.waitForFunction(() => window.__HIDDEN_AT__ !== undefined, undefined, {
        timeout: 15_000,
      });
      // 150 мс — середина перехода в 250 мс. Прежний код к этому моменту
      // держал бы полную непрозрачность: анимация с forwards не отдавала
      // управление инлайновому стилю.
      await page.waitForTimeout(150);
      const opacity = await page.evaluate(() => {
        const splash = document.getElementById('splash');
        return splash ? Number(getComputedStyle(splash).opacity) : 0;
      });
      expect(opacity).toBeLessThan(0.9);

      // И заставка действительно исчезает, а не остаётся прозрачным слоем.
      await page.waitForFunction(() => !document.getElementById('splash'), undefined, {
        timeout: 5_000,
      });
    } finally {
      await page.close();
    }
  }, 60_000);
});

declare global {
  interface Window {
    __RENDER_READY__?: boolean;
    __RENDER_ERROR__?: string;
    /** Была ли заставка на странице в тот миг, когда объявлена готовность. */
    __SPLASH_AT_READY__?: boolean;
    /** Момент, когда кабинет попросил заставку уйти. */
    __HIDDEN_AT__?: number;
  }
}
