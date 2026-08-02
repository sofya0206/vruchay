import { chromium, type Browser, type Page } from 'playwright';
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';

/**
 * Печать страницы приложения в PDF.
 *
 * Браузер поднимается один раз на всё задание: запуск занимает секунды,
 * а страниц может быть тысяча. Раз в RESTART_AFTER файлов браузер
 * перезапускается — Chromium при длительной работе течёт по памяти,
 * а рядом с ним на том же сервере живёт база.
 *
 * Экземпляр один на процесс и общий для массовой генерации и заявок с форм.
 * Отрисовки выстроены в очередь: параллельные вкладки съели бы память,
 * которой у воркера ровно 2 ГБ, а перезапуск браузера посреди чужой
 * отрисовки закрыл бы её вкладку. Очередь заодно даёт заявке с формы
 * попасть между двумя строками пакета, а не ждать пакет целиком.
 */

const RESTART_AFTER = 200;
const PAGE_TIMEOUT_MS = 30_000;
const READY_TIMEOUT_MS = 15_000;

@Injectable()
export class PdfRenderer implements OnModuleDestroy {
  private readonly logger = new Logger(PdfRenderer.name);
  private browser: Browser | null = null;
  private rendered = 0;
  /** Хвост очереди отрисовок: каждая ждёт завершения предыдущей. */
  private tail: Promise<unknown> = Promise.resolve();

  private readonly baseUrl: string;
  /** На проде — встроенный Chromium из образа, локально — системный Chrome. */
  private readonly channel?: string;

  constructor(config: ConfigService<Env, true>) {
    this.baseUrl =
      config.get('RENDER_BASE_URL', { infer: true }) ?? config.get('PUBLIC_URL', { infer: true });
    this.channel = config.get('PLAYWRIGHT_CHANNEL', { infer: true }) || undefined;
  }

  async onModuleDestroy(): Promise<void> {
    await this.close();
  }

  private async getBrowser(): Promise<Browser> {
    if (this.browser && this.rendered < RESTART_AFTER) return this.browser;
    if (this.browser) {
      this.logger.log(`Перезапуск браузера после ${this.rendered} файлов`);
      await this.close();
    }
    this.browser = await chromium.launch({
      channel: this.channel,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });
    this.rendered = 0;
    return this.browser;
  }

  /** Ставит отрисовку в общую очередь. Ошибка одной не рвёт цепочку следующих. */
  render(
    token: string,
    pageWidthMm: number,
    pageHeightMm: number,
    format: 'pdf' | 'jpg',
  ): Promise<Buffer> {
    const result = this.tail.then(() =>
      this.renderNow(token, pageWidthMm, pageHeightMm, format),
    );
    this.tail = result.catch(() => undefined);
    return result;
  }

  private async renderNow(
    token: string,
    pageWidthMm: number,
    pageHeightMm: number,
    format: 'pdf' | 'jpg',
  ): Promise<Buffer> {
    const browser = await this.getBrowser();
    const page: Page = await browser.newPage({
      viewport: { width: mmToPx(pageWidthMm), height: mmToPx(pageHeightMm) },
    });

    try {
      page.setDefaultTimeout(PAGE_TIMEOUT_MS);
      await page.goto(`${this.baseUrl}/render?token=${encodeURIComponent(token)}`, {
        waitUntil: 'domcontentloaded',
      });

      // Ждём не «сеть затихла», а явный флаг от страницы: он выставляется
      // только после загрузки шрифтов и фоновых изображений.
      await page.waitForFunction(
        () => window.__RENDER_READY__ === true || Boolean(window.__RENDER_ERROR__),
        undefined,
        { timeout: READY_TIMEOUT_MS },
      );

      const error = await page.evaluate(() => window.__RENDER_ERROR__);
      if (error) throw new Error(`Страница рендера сообщила об ошибке: ${error}`);

      this.rendered++;

      if (format === 'jpg') {
        return await page.screenshot({ type: 'jpeg', quality: 92, fullPage: true });
      }
      return await page.pdf({
        width: `${pageWidthMm}mm`,
        height: `${pageHeightMm}mm`,
        printBackground: true,
        margin: { top: '0', right: '0', bottom: '0', left: '0' },
      });
    } finally {
      await page.close().catch(() => undefined);
    }
  }

  async close(): Promise<void> {
    await this.browser?.close().catch(() => undefined);
    this.browser = null;
  }
}

function mmToPx(mm: number): number {
  return Math.round((mm * 96) / 25.4);
}

declare global {
  interface Window {
    __RENDER_READY__?: boolean;
    __RENDER_ERROR__?: string;
  }
}
