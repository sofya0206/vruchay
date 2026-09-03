#!/usr/bin/env node
/**
 * Предварительная отрисовка публичных страниц.
 *
 * Приложение собирается как одностраничное: в собранном index.html лежит
 * пустой div, а весь текст появляется после выполнения скриптов. Google это
 * обычно разбирает, Яндекс — плохо и непредсказуемо, а он и есть наш рынок.
 *
 * Скрипт поднимает собранную сборку, открывает каждый публичный адрес
 * в браузере, дожидается отрисовки и кладёт рядом готовый HTML. Робот
 * получает текст сразу, человек — то же самое приложение: скрипты остаются
 * на месте и подхватывают страницу как обычно.
 *
 * Кабинет не трогаем: он за входом, роботу там делать нечего.
 *
 * Запускается после `vite build`, браузер тот же, что печатает документы.
 */
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const DIST = join(dirname(fileURLToPath(import.meta.url)), 'dist');
/*
 * Что отрисовываем заранее для поисковика.
 *
 * Посадочная, политика и отраслевые лендинги: их ищут и по ним приходят.
 * Черновики оферты и договора-поручения сюда не входят намеренно — они
 * помечены noindex и ждут юриста. База знаний тоже: её содержимое
 * подгружается частями, и предотрисовка тянула бы мегабайт документации
 * в статику.
 */
const ROUTES = [
  '/',
  '/privacy',
  '/gov',
  '/business',
  '/personal',
  '/sport',
  '/education',
  '/international',
  '/pricing',
];
const PORT = 4178;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
};

/** Отдаёт собранные файлы; неизвестные пути — на index.html, как в проде. */
function serve() {
  return createServer(async (req, res) => {
    const path = decodeURIComponent((req.url ?? '/').split('?')[0]);
    let file = join(DIST, path);
    if (!existsSync(file) || path.endsWith('/')) file = join(DIST, 'index.html');
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
}

/**
 * Заставка, которую надо вернуть в готовую разметку.
 *
 * Ловушка: отрисовка запускает само приложение, а оно убирает заставку,
 * как только поднялось. Сохранённый HTML поэтому оказывается без неё —
 * и на сервер уезжала сборка, где заставки нет вовсе. Так и случилось
 * при выкате 07.08.2026: в бою её не оказалось.
 *
 * Возвращать нужно именно сюда: этот же файл отдаётся как запасной для
 * всех прочих адресов, включая кабинет. Без заставки человек, открывший
 * «Настройки», на мгновение видит посадочную страницу, и только потом
 * её сменяет кабинет.
 *
 * Забираем блок до цикла: первая же запись перетирает dist/index.html.
 */
const source = await readFile(join(DIST, 'index.html'), 'utf8');
const splash = source.match(/<div id="splash">[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/)?.[0];
if (!splash) {
  console.error('✗ В собранной разметке нет заставки — проверьте apps/web/index.html');
  process.exit(1);
}

const server = serve();
await new Promise((resolve) => server.listen(PORT, resolve));

const browser = await chromium.launch({
  channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
  args: ['--no-sandbox'],
});

let failed = 0;
for (const route of ROUTES) {
  const page = await browser.newPage();
  try {
    await page.goto(`http://localhost:${PORT}${route}`, { waitUntil: 'networkidle', timeout: 20_000 });
    // Ждём не таймер, а признак отрисовки: заголовок первого уровня есть
    // только после того, как React собрал страницу.
    await page.waitForSelector('h1', { timeout: 10_000 });

    let html = await page.content();
    // Пустая разметка означала бы, что мы сохранили ту же заглушку,
    // ради ухода от которой всё и затевалось.
    if (!/<h1/.test(html)) throw new Error('в разметке нет заголовка');

    // Возвращаем заставку, которую приложение убрало при отрисовке.
    if (!html.includes('id="splash"')) {
      html = html.replace('</body>', `${splash}\n  </body>`);
      if (!html.includes('id="splash"')) throw new Error('не удалось вернуть заставку');
    }

    const out = route === '/' ? join(DIST, 'index.html') : join(DIST, route, 'index.html');
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, html, 'utf8');
    console.log(`✓ ${route} — ${Math.round(html.length / 1024)} КБ разметки`);
  } catch (err) {
    failed++;
    console.error(`✗ ${route} — ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    await page.close();
  }
}

await browser.close();
server.close();

if (failed) {
  console.error('Отрисовка не удалась — сборка не должна уехать на сервер.');
  process.exit(1);
}
