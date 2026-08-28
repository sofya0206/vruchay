import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
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

/**
 * Сколько раз подряд браузер вправе не подняться, прежде чем мы перестанем
 * пытаться.
 *
 * Запуск Chromium — не мелочь: секунды процессорного времени и всплеск
 * памяти. Пакет на тысячу строк, упирающийся в сломанный браузер, за минуту
 * сделает тысячу таких попыток и добьёт сервер, вместо того чтобы сказать
 * человеку, что печатать нечем.
 */
const LAUNCH_ATTEMPTS = 3;

@Injectable()
export class PdfRenderer implements OnModuleDestroy {
  private readonly logger = new Logger(PdfRenderer.name);
  private browser: Browser | null = null;
  /**
   * Общий контекст пакета: в нём живёт кэш страницы и шрифтов.
   *
   * Раньше каждая страница открывалась своим контекстом, и кэш был пуст
   * всегда: на пакете в тысячу грамот это тысяча загрузок 787-килобайтного
   * кода и всех начертаний. Дело не только в скорости — лишний вес
   * расширяет окно, в которое в готовый PDF успевает попасть лишнее
   * (см. заставку в index.html).
   *
   * Утечки чужих данных из этого не выходит: страница печати ничего
   * не хранит между открытиями, а данные получателя приезжают по разовому
   * подписанному токену, и адрес запроса у каждой строки свой. Общими
   * остаются только неизменные файлы сборки.
   */
  private context: BrowserContext | null = null;
  /**
   * Сколько отрисовок браузер уже обслужил.
   *
   * Считаем попытки, а не удачи, и это принципиально. При счёте удач
   * упавший браузер никогда не добирался до порога перезапуска: неудачи
   * счётчик не двигали, и воркер до перезапуска сервиса руками бился
   * в мёртвый процесс, помечая все оставшиеся строки «не удалось создать».
   */
  private rendered = 0;
  /** Сколько раз подряд не удалось поднять браузер. */
  private launchFailures = 0;
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

  /**
   * Живой контекст, в котором можно открыть страницу.
   *
   * Живость проверяется перед каждой отрисовкой, а не подразумевается:
   * воркеру отведено 2 ГБ, Chromium по памяти убивают, и после этого
   * объект браузера остаётся на месте — мёртвым. Раньше программа
   * продолжала к нему обращаться, и одна поломка за секунды помечала
   * весь остаток пакета «документ не удалось создать».
   */
  private async getContext(): Promise<BrowserContext> {
    if (this.browser && !this.browser.isConnected()) {
      this.logger.warn(`Браузер отвалился после ${this.rendered} файлов — поднимаем заново`);
      await this.close();
    }
    if (this.browser && this.rendered >= RESTART_AFTER) {
      this.logger.log(`Перезапуск браузера после ${this.rendered} файлов`);
      await this.close();
    }
    if (this.context) return this.context;

    if (this.launchFailures >= LAUNCH_ATTEMPTS) {
      throw new Error(
        `Браузер не удалось запустить ${this.launchFailures} раза подряд — печатать нечем`,
      );
    }

    try {
      this.browser = await chromium.launch({
        channel: this.channel,
        args: ['--no-sandbox', '--disable-dev-shm-usage'],
      });
      this.context = await this.browser.newContext();
      this.launchFailures = 0;
      this.rendered = 0;
      return this.context;
    } catch (err) {
      this.launchFailures++;
      await this.close();
      throw err;
    }
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

  /**
   * Печать готовой разметки, без открытия страницы приложения.
   *
   * Нужна для документов, которых нет в интерфейсе: счетов, актов. Заводить
   * ради них маршрут и подписанный токен — лишняя механика там, где данные
   * и так уже на сервере.
   */
  renderHtml(html: string): Promise<Buffer> {
    const result = this.tail.then(() => this.renderHtmlNow(html));
    this.tail = result.catch(() => undefined);
    return result;
  }

  private async renderHtmlNow(html: string): Promise<Buffer> {
    const context = await this.getContext();
    // Счётчик двигаем до работы, а не после: перезапуск по износу должен
    // наступать и в том случае, когда браузер портится и роняет страницы.
    this.rendered++;
    const page = await context.newPage();
    try {
      page.setDefaultTimeout(PAGE_TIMEOUT_MS);
      await page.setContent(html, { waitUntil: 'domcontentloaded' });
      return await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '14mm', right: '14mm', bottom: '14mm', left: '14mm' },
      });
    } finally {
      await page.close().catch(() => undefined);
    }
  }

  private async renderNow(
    token: string,
    pageWidthMm: number,
    pageHeightMm: number,
    format: 'pdf' | 'jpg',
  ): Promise<Buffer> {
    const context = await this.getContext();
    this.rendered++;
    const page: Page = await context.newPage();

    try {
      // Размер окна у каждого документа свой, а контекст общий, — поэтому
      // не при создании контекста, а на самой странице.
      await page.setViewportSize({ width: mmToPx(pageWidthMm), height: mmToPx(pageHeightMm) });
      page.setDefaultTimeout(PAGE_TIMEOUT_MS);
      await page.goto(`${this.baseUrl}/render?token=${encodeURIComponent(token)}`, {
        waitUntil: 'domcontentloaded',
      });

      // Ждём не «сеть затихла», а явный флаг от страницы: он выставляется
      // только после загрузки шрифтов и фоновых изображений и только если
      // поверх листа ничего не осталось.
      await page.waitForFunction(
        () => window.__RENDER_READY__ === true || Boolean(window.__RENDER_ERROR__),
        undefined,
        { timeout: READY_TIMEOUT_MS },
      );

      const error = await page.evaluate(() => window.__RENDER_ERROR__);
      if (error) throw new Error(`Страница рендера сообщила об ошибке: ${error}`);

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
    await this.context?.close().catch(() => undefined);
    this.context = null;
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
