import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * Живучесть браузера-робота.
 *
 * Настоящий Chromium здесь не нужен и вреден: проверяются не картинки,
 * а поведение при падении, и воспроизвести падение по памяти на живом
 * браузере нельзя. Поэтому Playwright подменён — ровно теми методами,
 * которыми пользуется PdfRenderer.
 *
 * Все три правила пришли с приёмки 28.08.2026:
 *
 *  — мёртвый браузер надо заметить и поднять заново. Раньше программа
 *    продолжала обращаться к убитому по памяти процессу, и весь остаток
 *    пакета за секунды помечался «документ не удалось создать»;
 *  — считать надо попытки, а не удачи. При счёте удач упавший браузер
 *    никогда не доходил до порога перезапуска: неудачи счётчик не двигали;
 *  — кэш страницы и шрифтов должен переживать документ. Каждая отрисовка
 *    качала 787 КБ кода и все начертания заново.
 */

const launch = vi.fn();
vi.mock('playwright', () => ({ chromium: { launch: (...args: unknown[]) => launch(...args) } }));

const { PdfRenderer } = await import('./pdf-renderer');

/** Страница в том объёме, которым пользуется PdfRenderer. */
function fakePage() {
  return {
    setViewportSize: vi.fn(async () => undefined),
    setDefaultTimeout: vi.fn(),
    goto: vi.fn(async () => undefined),
    waitForFunction: vi.fn(async () => undefined),
    evaluate: vi.fn(async () => undefined),
    setContent: vi.fn(async () => undefined),
    pdf: vi.fn(async () => Buffer.from('%PDF-1.4')),
    screenshot: vi.fn(async () => Buffer.from('jpg')),
    close: vi.fn(async () => undefined),
  };
}

interface Fake {
  browser: { isConnected: () => boolean; newContext: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> };
  context: { newPage: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> };
  /** Так выглядит убитый по памяти процесс: объект жив, браузера нет. */
  die: () => void;
  pages: ReturnType<typeof fakePage>[];
}

function fakeBrowser(): Fake {
  let alive = true;
  const pages: ReturnType<typeof fakePage>[] = [];
  const context = {
    newPage: vi.fn(async () => {
      const page = fakePage();
      pages.push(page);
      return page;
    }),
    close: vi.fn(async () => undefined),
  };
  const browser = {
    isConnected: () => alive,
    newContext: vi.fn(async () => context),
    close: vi.fn(async () => {
      alive = false;
    }),
  };
  return { browser, context, pages, die: () => (alive = false) };
}

const config = { get: () => 'http://render.test' } as never;

function renderer() {
  return new PdfRenderer(config);
}

beforeEach(() => {
  launch.mockReset();
});

describe('мёртвый браузер поднимается заново', () => {
  it('следующая отрисовка после падения проходит, а не отравляет остаток пакета', async () => {
    const first = fakeBrowser();
    const second = fakeBrowser();
    launch.mockResolvedValueOnce(first.browser).mockResolvedValueOnce(second.browser);

    const r = renderer();
    await r.render('t1', 210, 297, 'pdf');

    // Так процесс выглядит после того, как его убили по памяти.
    first.die();

    await expect(r.render('t2', 210, 297, 'pdf')).resolves.toBeInstanceOf(Buffer);
    expect(launch).toHaveBeenCalledTimes(2);
    expect(second.pages).toHaveLength(1);
  });

  it('живой браузер заново не поднимается', async () => {
    const only = fakeBrowser();
    launch.mockResolvedValue(only.browser);

    const r = renderer();
    await r.render('t1', 210, 297, 'pdf');
    await r.render('t2', 210, 297, 'pdf');

    expect(launch).toHaveBeenCalledTimes(1);
  });
});

describe('перезапуск по износу считает попытки, а не удачи', () => {
  it('двести неудачных отрисовок подряд тоже приводят к перезапуску', async () => {
    const first = fakeBrowser();
    const second = fakeBrowser();
    launch.mockResolvedValueOnce(first.browser).mockResolvedValueOnce(second.browser);

    const r = renderer();
    // Страница отвечает отказом: отрисовка не удалась, но браузер жив.
    first.context.newPage.mockImplementation(async () => {
      const page = fakePage();
      page.evaluate.mockResolvedValue('Не загрузились шрифты: Lora 400' as never);
      return page;
    });

    for (let i = 0; i < 200; i++) {
      await r.render(`t${i}`, 210, 297, 'pdf').catch(() => undefined);
    }
    // 201-я обязана достаться уже новому браузеру: старый отработал
    // свои двести и, судя по череде отказов, как раз портится.
    await r.render('last', 210, 297, 'pdf').catch(() => undefined);

    expect(launch).toHaveBeenCalledTimes(2);
  });
});

describe('кэш живёт дольше одного документа', () => {
  it('весь пакет печатается в одном контексте, страница у каждого своя', async () => {
    const only = fakeBrowser();
    launch.mockResolvedValue(only.browser);

    const r = renderer();
    for (let i = 0; i < 5; i++) await r.render(`t${i}`, 210, 297, 'pdf');

    // Один контекст на пакет — значит один кэш кода и шрифтов.
    expect(only.browser.newContext).toHaveBeenCalledTimes(1);
    // Но страница у каждого документа своя, и закрывается она сразу:
    // одна страница на всех оставила бы предыдущего получателя в памяти.
    expect(only.context.newPage).toHaveBeenCalledTimes(5);
    expect(only.pages.every((p) => p.close.mock.calls.length === 1)).toBe(true);
  });

  it('размер листа задаётся странице, а не контексту: у документов он разный', async () => {
    const only = fakeBrowser();
    launch.mockResolvedValue(only.browser);

    const r = renderer();
    await r.render('t1', 210, 297, 'pdf');
    await r.render('t2', 297, 210, 'pdf');

    expect(only.pages[0].setViewportSize).toHaveBeenCalledWith({ width: 794, height: 1123 });
    expect(only.pages[1].setViewportSize).toHaveBeenCalledWith({ width: 1123, height: 794 });
  });
});

describe('браузер, который не поднимается', () => {
  it('после трёх неудач подряд перестаём пытаться и говорим почему', async () => {
    launch.mockRejectedValue(new Error('Failed to launch: executable not found'));

    const r = renderer();
    for (let i = 0; i < 3; i++) {
      await expect(r.render(`t${i}`, 210, 297, 'pdf')).rejects.toThrow();
    }
    expect(launch).toHaveBeenCalledTimes(3);

    // Четвёртая и дальше — без новых попыток: запуск Chromium стоит
    // секунд процессора, и пакет на тысячу строк добил бы сервер.
    await expect(r.render('t4', 210, 297, 'pdf')).rejects.toThrow(/печатать нечем/);
    expect(launch).toHaveBeenCalledTimes(3);
  });

  it('удачный запуск обнуляет счёт неудач', async () => {
    const good = fakeBrowser();
    launch
      .mockRejectedValueOnce(new Error('Failed to launch'))
      .mockRejectedValueOnce(new Error('Failed to launch'))
      .mockResolvedValueOnce(good.browser);

    const r = renderer();
    await expect(r.render('t1', 210, 297, 'pdf')).rejects.toThrow();
    await expect(r.render('t2', 210, 297, 'pdf')).rejects.toThrow();
    await expect(r.render('t3', 210, 297, 'pdf')).resolves.toBeInstanceOf(Buffer);
  });
});
