import { chromium, type Browser } from 'playwright';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFString } from 'pdf-lib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/*
 * Ссылки в PDF — то, на чём стоит задача 2.6.
 *
 * Ссылка на листе — это `<a href>` в разметке, которую печатает Chromium.
 * Кликабельной в PDF она становится не сама собой, а потому, что Chromium
 * превращает `<a>` в аннотацию `/Link` с прямоугольником в координатах
 * страницы. Здесь проверяется ровно это обещание — и что аннотация ложится
 * туда, где стоит блок, с точностью до миллиметра, и что `<a>` поверх
 * картинки (так сделан QR) тоже даёт аннотацию.
 *
 * Тест идёт только под CHROMIUM_TESTS=1, как и соседние сверки с браузером.
 */

const CHROMIUM_TESTS = process.env.CHROMIUM_TESTS === '1';

interface Found {
  uri: string;
  /** Прямоугольник в мм от левого верхнего угла — как в макете. */
  x: number;
  y: number;
  w: number;
  h: number;
}

const PT_PER_MM = 72 / 25.4;

/** Аннотации-ссылки страницы — в миллиметрах макета (PDF считает снизу вверх). */
async function linksOf(pdf: Uint8Array): Promise<Found[]> {
  const doc = await PDFDocument.load(pdf);
  const page = doc.getPage(0);
  const pageHeightPt = page.getHeight();
  const annots = page.node.Annots();
  if (!annots) return [];

  const out: Found[] = [];
  for (let i = 0; i < annots.size(); i++) {
    const annot = doc.context.lookup(annots.get(i), PDFDict);
    if (annot.get(PDFName.of('Subtype'))?.toString() !== '/Link') continue;
    const action = annot.get(PDFName.of('A'));
    const actionDict = action instanceof PDFDict ? action : doc.context.lookup(action, PDFDict);
    const uri = actionDict.get(PDFName.of('URI'));
    const rect = annot.get(PDFName.of('Rect'));
    if (!(uri instanceof PDFString) || !(rect instanceof PDFArray)) continue;
    const [x1, y1, x2, y2] = [0, 1, 2, 3].map((k) => (rect.get(k) as PDFNumber).asNumber());
    out.push({
      uri: uri.decodeText(),
      x: Math.min(x1, x2) / PT_PER_MM,
      y: (pageHeightPt - Math.max(y1, y2)) / PT_PER_MM,
      w: Math.abs(x2 - x1) / PT_PER_MM,
      h: Math.abs(y2 - y1) / PT_PER_MM,
    });
  }
  return out;
}

describe.skipIf(!CHROMIUM_TESTS)('ссылки в PDF против настоящего Chromium', () => {
  let browser: Browser;
  let links: Found[];

  beforeAll(async () => {
    browser = await chromium.launch({
      channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });
    const page = await browser.newPage();
    // Та же геометрия, что у SheetRenderer: лист в мм, блоки абсолютно.
    await page.setContent(
      `<body style="margin:0"><div style="position:relative;width:297mm;height:210mm">
        <a href="https://vruchay.ru/verify/K7M2-9QXR" style="position:absolute;left:40mm;top:150mm;width:80mm;height:8mm;display:block">проверить</a>
        <a href="https://vruchay.ru/verify/K7M2-9QXR" style="position:absolute;left:240mm;top:160mm;width:30mm;height:30mm;display:block">
          <img alt="" style="display:block;width:100%;height:100%" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7">
        </a>
      </div></body>`,
    );
    const pdf = await page.pdf({
      width: '297mm',
      height: '210mm',
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });
    await page.close();
    links = await linksOf(pdf);
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
  });

  it('текстовая ссылка и ссылка поверх картинки становятся аннотациями', () => {
    expect(links).toHaveLength(2);
    expect(links.every((l) => l.uri === 'https://vruchay.ru/verify/K7M2-9QXR')).toBe(true);
  });

  it('аннотация лежит там, где стоит блок, с точностью до миллиметра', () => {
    const text = links.find((l) => l.w > 50)!;
    const qr = links.find((l) => l.w < 50)!;
    expect(text.x).toBeCloseTo(40, 0);
    expect(text.y).toBeCloseTo(150, 0);
    expect(text.w).toBeCloseTo(80, 0);
    expect(qr.x).toBeCloseTo(240, 0);
    expect(qr.y).toBeCloseTo(160, 0);
    expect(qr.w).toBeCloseTo(30, 0);
    expect(qr.h).toBeCloseTo(30, 0);
  });
});
