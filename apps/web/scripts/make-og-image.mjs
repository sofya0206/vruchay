#!/usr/bin/env node
/**
 * Картинка предпросмотра ссылки (`og:image`/`twitter:image`), одна на все
 * публичные страницы — `public/og-image.png`, 1200×630.
 *
 * Рисуем тем же браузером, что печатает документы и иконки (см.
 * `make-icons.mjs`): для одной картинки отдельная библиотека растеризации
 * не стоит зависимости. Шрифт вшит base64 — Плейwright открывает страницу
 * без сервера, файловый путь к `public/fonts` он не увидит.
 * Запуск: `node scripts/make-og-image.mjs` из apps/web.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FONTS = join(ROOT, 'public', 'fonts');
const OUT = join(ROOT, 'public', 'og-image.png');

async function fontDataUrl(file) {
  const buf = await readFile(join(FONTS, file));
  return `data:font/woff2;base64,${buf.toString('base64')}`;
}

const [regular, semibold] = await Promise.all([
  fontDataUrl('jost-400-normal-cyrillic.732ac61f.woff2'),
  fontDataUrl('jost-600-normal-cyrillic.732ac61f.woff2'),
]);

// Знак «В» — те же две кривые, что в shell/Brand.tsx, белым по кобальту.
const html = `
<style>
  @font-face { font-family: 'Jost'; src: url('${regular}') format('woff2'); font-weight: 400; }
  @font-face { font-family: 'Jost'; src: url('${semibold}') format('woff2'); font-weight: 600; }
  html, body { margin: 0; }
  .card {
    width: 1200px;
    height: 630px;
    background: #0f6ac1;
    position: relative;
    overflow: hidden;
    font-family: 'Jost', sans-serif;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 0 96px;
    box-sizing: border-box;
  }
  .arcs { position: absolute; inset: 0; opacity: 0.16; }
  .mark { width: 84px; height: 84px; }
  h1 { margin: 36px 0 0; font-size: 68px; font-weight: 600; color: #fff; letter-spacing: 0.01em; }
  p { margin: 22px 0 0; max-width: 820px; font-size: 30px; line-height: 1.4; color: rgba(255,255,255,.86); font-weight: 400; }
</style>
<div class="card">
  <svg class="arcs" viewBox="0 0 1200 630" fill="none" stroke="#fff" stroke-width="1.5">
    ${Array.from({ length: 10 }, (_, i) => `<circle cx="1180" cy="40" r="${60 + i * 46}" />`).join('')}
  </svg>
  <svg class="mark" viewBox="0 0 24 24">
    <path d="M7.5,6.19 H13.5 A2.77,2.77 0 0 1 13.5,11.72 H7.5 Z" fill="#fff" />
    <path d="M7.5,11.72 H13.69 A2.95,2.95 0 0 1 13.69,17.63 H7.5 Z" fill="#fff" />
  </svg>
  <h1>Вручай</h1>
  <p>Именные дипломы и сертификаты по списку участников — с рассылкой и проверкой подлинности. Данные остаются в России.</p>
</div>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 2 });
await page.setContent(html);
await page.evaluate(() => document.fonts.ready);
await writeFile(OUT, await page.screenshot());
await browser.close();
console.log('og-image.png — 1200×630 @2x');
