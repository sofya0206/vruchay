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
const ROUTES = ['/', '/privacy'];
const PORT = 4178;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
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

    const html = await page.content();
    // Пустая разметка означала бы, что мы сохранили ту же заглушку,
    // ради ухода от которой всё и затевалось.
    if (!/<h1/.test(html)) throw new Error('в разметке нет заголовка');

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
