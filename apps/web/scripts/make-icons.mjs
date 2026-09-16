#!/usr/bin/env node
/**
 * Иконки приложения из `public/icon.svg` и `public/icon-maskable.svg`.
 *
 * PNG нужны манифесту и iOS, favicon.ico — вкладке; рисуем их тем же
 * браузером, что печатает документы, — отдельная библиотека растеризации
 * ради нескольких файлов не стоит зависимости.
 * Запуск: `node scripts/make-icons.mjs` из apps/web.
 */
import { readFile, writeFile } from 'node:fs/promises';
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

async function draw(svg, size) {
  const markup = await readFile(join(PUBLIC, svg), 'utf8');
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${markup}`,
  );
  return page.screenshot({ omitBackground: true });
}

for (const { svg, out, size } of TARGETS) {
  await writeFile(join(PUBLIC, out), await draw(svg, size));
  console.log(`${out} — ${size}×${size}`);
}

/*
  favicon.ico — для клиентов, которые берут значок вкладки по этому адресу,
  не читая разметку: не найдя файла, они рисуют собственную заглушку.
  Внутри обычные PNG: контейнер это позволяет, и так не нужен кодировщик BMP.
*/
const ICO_SIZES = [16, 32, 48];
const frames = [];
for (const size of ICO_SIZES) frames.push({ size, png: await draw('icon.svg', size) });

let offset = 6 + 16 * frames.length;
const header = Buffer.alloc(6);
header.writeUInt16LE(1, 2); // тип: значок
header.writeUInt16LE(frames.length, 4);
const entries = frames.map(({ size, png }) => {
  const entry = Buffer.alloc(16);
  entry.writeUInt8(size, 0);
  entry.writeUInt8(size, 1);
  entry.writeUInt16LE(1, 4); // плоскостей
  entry.writeUInt16LE(32, 6); // бит на точку
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(offset, 12);
  offset += png.length;
  return entry;
});
await writeFile(
  join(PUBLIC, 'favicon.ico'),
  Buffer.concat([header, ...entries, ...frames.map((f) => f.png)]),
);
console.log(`favicon.ico — ${ICO_SIZES.join('×, ')}×`);

await browser.close();
