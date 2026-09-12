#!/usr/bin/env node
/**
 * Иконки приложения из `public/icon.svg` и `public/icon-maskable.svg`.
 *
 * PNG нужны манифесту и iOS; рисуем их тем же браузером, что печатает
 * документы, — отдельная библиотека растеризации ради четырёх файлов
 * не стоит зависимости. Запуск: `node scripts/make-icons.mjs` из apps/web.
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

const TARGETS = [
  { svg: 'icon.svg', out: 'icon-192.png', size: 192 },
  { svg: 'icon.svg', out: 'icon-512.png', size: 512 },
  { svg: 'icon.svg', out: 'apple-touch-icon.png', size: 180 },
  { svg: 'icon-maskable.svg', out: 'icon-maskable-512.png', size: 512 },
];

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });

for (const { svg, out, size } of TARGETS) {
  const markup = await readFile(join(PUBLIC, svg), 'utf8');
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${markup}`,
  );
  await page.screenshot({ path: join(PUBLIC, out), omitBackground: true });
  console.log(`${out} — ${size}×${size}`);
}

await browser.close();
