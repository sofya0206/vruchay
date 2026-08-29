import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { sheetLayout, substituteVariables } from '@gramota/shared';
import type { RenderController } from '../../../src/render/render.controller';

/**
 * Страница печати вместо кабинета.
 *
 * `PdfRenderer` открывает браузером `<RENDER_BASE_URL>/render?token=…` —
 * обычную страницу кабинета. Поднимать в конвейере собранный кабинет
 * ради этого мы не стали: страница печати — это React, шрифты и сборка
 * веба, то есть минуты на работу, которая ничего не говорит о базе.
 *
 * Заменена только сама страница. Всё остальное на пути настоящее:
 * подписанный токен, `RenderController` с настоящей Prisma, подстановка
 * переменных из `@gramota/shared` (включая падежи), настоящий Chromium
 * и настоящий `page.pdf()`. Что именно подменено — видно здесь, в одном
 * файле, а не разбросано по тестам.
 */
export interface RenderPage {
  url: string;
  use(controller: RenderController): void;
  close(): Promise<void>;
}

export async function startRenderPage(): Promise<RenderPage> {
  let controller: RenderController | null = null;

  const server: Server = createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (url.pathname !== '/render') {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      try {
        if (!controller) throw new Error('Страница печати не подключена к приложению');
        const data = await controller.getRenderData(url.searchParams.get('token') ?? '');
        res.end(page(data));
      } catch (err) {
        // Ошибку отдаём страницей, а не кодом ответа: воркер ждёт от
        // страницы флага, а не HTTP-статуса, и должен получить внятную
        // причину, а не таймаут.
        res.end(failure(err instanceof Error ? err.message : String(err)));
      }
    })();
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}`,
    use: (next) => {
      controller = next;
    },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

/** Ровно то, что отдаёт RenderController. */
type RenderData = Awaited<ReturnType<RenderController['getRenderData']>>;

function page(data: RenderData): string {
  const sheets = data.sheets
    .map((sheet) => renderSheet(sheet.layout, data, data.data as Record<string, string>))
    .join('');

  return `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<style>
  @page { size: ${data.pageWidthMm}mm ${data.pageHeightMm}mm; margin: 0 }
  html, body { margin: 0; padding: 0 }
  .sheet { position: relative; width: ${data.pageWidthMm}mm; height: ${data.pageHeightMm}mm;
           overflow: hidden; background: #fff }
  .el { position: absolute; white-space: pre-wrap }
</style></head><body>${sheets}
<script>document.fonts.ready.then(function () { window.__RENDER_READY__ = true })</script>
</body></html>`;
}

function failure(message: string): string {
  return `<!doctype html><html><body><script>window.__RENDER_ERROR__ = ${JSON.stringify(message)}</script></body></html>`;
}

function renderSheet(layout: unknown, data: RenderData, values: Record<string, string>): string {
  const parsed = sheetLayout.safeParse(layout);
  if (!parsed.success) return '<div class="sheet"></div>';

  const elements = parsed.data
    .map((element) => {
      if (element.type === 'text') {
        return box(
          element,
          textStyle(element.props),
          substituteVariables(element.props.text, values),
        );
      }
      if (element.type === 'qr') {
        // Код рисовать незачем: проверяется он не глазами, а страницей
        // проверки по publicId. Адрес выводим текстом — так видно, что
        // в лист попал именно этот экземпляр.
        const content = element.props.template
          ? substituteVariables(element.props.template, values)
          : (data.verifyUrl ?? '');
        return box(element, 'font-size:6pt', content);
      }
      return '';
    })
    .join('');

  return `<div class="sheet">${elements}</div>`;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
}

function box(element: Box, style: string, text: string): string {
  const place =
    `left:${element.x}mm;top:${element.y}mm;width:${element.w}mm;height:${element.h}mm;` +
    (element.rotation ? `transform:rotate(${element.rotation}deg);` : '');
  return `<div class="el" style="${place}${style}">${escapeHtml(text)}</div>`;
}

function textStyle(props: {
  fontFamily: string;
  fontSize: number;
  color: string;
  align: string;
  lineHeight: number;
  bold: boolean;
  italic: boolean;
  uppercase: boolean;
}): string {
  return (
    `font-family:${JSON.stringify(props.fontFamily)},sans-serif;` +
    `font-size:${props.fontSize}pt;color:${props.color};text-align:${props.align};` +
    `line-height:${props.lineHeight};` +
    `font-weight:${props.bold ? 700 : 400};font-style:${props.italic ? 'italic' : 'normal'};` +
    `text-transform:${props.uppercase ? 'uppercase' : 'none'}`
  );
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
