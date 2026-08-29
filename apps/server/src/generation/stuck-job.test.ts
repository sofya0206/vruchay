import { describe, expect, it, vi } from 'vitest';
import { GenerationController } from './generation.controller';
import { STUCK_AFTER_MS, isStuck } from './generation.service';
import { World } from './generation.test-utils';

/*
 * Задание, зависшее в состоянии «в очереди» навсегда.
 *
 * Запись о задании коммитится в базу, и только потом пакет кладётся
 * в очередь. Между этими двумя шагами Redis может моргнуть, а процесс —
 * перезапуститься при выкате. До этой правки такое задание оставалось
 * «в очереди» вечно: бесконечный прогресс на экране, занятая бронь
 * бесплатной квоты, материал под замком «выпуск уже идёт» — и кнопка
 * «Продолжить», которая отвечала «этот выпуск и так идёт».
 *
 * Спасало только «Отменить», о чём догадаться было неоткуда.
 *
 * Рубежей теперь два, и оба здесь проверяются: постановка сама закрывает
 * задание, если очередь не приняла пакет, а сторож раз в несколько минут
 * подбирает то, что закрыть не успели, — например, когда процесс убили
 * посреди постановки.
 */

const actor = {} as never;
const audit = { record: async () => undefined } as never;
const config = { get: () => 300 } as never;
const user = (orgId = 'org-1') => ({ orgId }) as never;

function controller(w: World): GenerationController {
  return new GenerationController(w.service, w.processor, {} as never, audit, config);
}

/** Сдвигает создание задания в прошлое: время в проверке настоящее. */
function age(w: World, jobId: string, ms: number): void {
  w.job(jobId).createdAt = new Date(Date.now() - ms);
}

describe('очередь не приняла пакет', () => {
  it('задание закрывается сразу, а не остаётся «в очереди» навсегда', async () => {
    const w = new World({ rows: 10, plan: 'paid' });
    vi.spyOn(w.queue, 'addBulk').mockRejectedValueOnce(new Error('Redis не отвечает'));

    await expect(controller(w).start(user(), actor, 'doc-1', { format: 'pdf' })).rejects.toThrow(
      /Очередь заданий сейчас недоступна/,
    );

    expect(w.job().status).toBe('failed');
    expect(w.job().error).toContain('Продолжить');
  });

  it('материал не остаётся заблокированным: выпуск можно начать заново', async () => {
    const w = new World({ rows: 10, plan: 'paid' });
    vi.spyOn(w.queue, 'addBulk').mockRejectedValueOnce(new Error('Redis не отвечает'));
    await expect(controller(w).start(user(), actor, 'doc-1', { format: 'pdf' })).rejects.toThrow();

    // До правки здесь было «Генерация по этому документу уже идёт» — и так
    // до тех пор, пока человек не догадается нажать «Отменить».
    await expect(controller(w).start(user(), actor, 'doc-1', { format: 'pdf' })).resolves.toBeTruthy();
  });

  it('бронь бесплатной квоты возвращается организации', async () => {
    // Проба на 50 документов, задание на 40. Пока оно висело «в очереди»,
    // эти сорок числились занятыми, и второй выпуск не проходил.
    const w = new World({ rows: 40 });
    vi.spyOn(w.queue, 'addBulk').mockRejectedValueOnce(new Error('Redis не отвечает'));
    await expect(controller(w).start(user(), actor, 'doc-1', { format: 'pdf' })).rejects.toThrow();

    await expect(controller(w).start(user(), actor, 'doc-1', { format: 'pdf' })).resolves.toBeTruthy();
  });

  it('«Продолжить» такое задание принимает и доводит выпуск до конца', async () => {
    const w = new World({ rows: 10, plan: 'paid' });
    vi.spyOn(w.queue, 'addBulk').mockRejectedValueOnce(new Error('Redis не отвечает'));
    await expect(controller(w).start(user(), actor, 'doc-1', { format: 'pdf' })).rejects.toThrow();

    await controller(w).resume(user(), actor, w.job().id);
    await w.drain();

    expect(w.job().status).toBe('done');
    expect(w.job().done).toBe(10);
  });
});

describe('сторож подбирает зависшие', () => {
  it('поднимает задание, за которым в очереди ничего не стоит', async () => {
    const w = new World({ rows: 10, plan: 'paid' });
    const job = await w.start();
    // Так выглядит убитый посреди постановки процесс: запись есть,
    // частей в очереди нет, закрыть задание никто не успел.
    w.queue.take();
    age(w, job.id, STUCK_AFTER_MS + 60_000);

    expect(await w.processor.sweepStuck()).toBe(1);
    await w.drain();

    expect(w.job().status).toBe('done');
    expect(w.job().done).toBe(10);
  });

  it('задание, части которого честно лежат в очереди, не трогает', async () => {
    // Иначе пакет, ждущий своей поры за чужой тысячей, встал бы в очередь
    // второй раз — и воркер печатал бы одно и то же дважды.
    const w = new World({ rows: 10, plan: 'paid' });
    const job = await w.start();
    age(w, job.id, STUCK_AFTER_MS + 60_000);

    expect(await w.processor.sweepStuck()).toBe(0);
    expect(w.job().status).toBe('queued');
  });

  it('недавнее задание не трогает: оно просто ждёт', async () => {
    const w = new World({ rows: 10, plan: 'paid' });
    const job = await w.start();
    w.queue.take();
    age(w, job.id, STUCK_AFTER_MS / 2);

    expect(await w.processor.sweepStuck()).toBe(0);
    expect(w.job().status).toBe('queued');
  });

  it('идущее задание не трогает, даже если оно идёт долго', async () => {
    const w = new World({ rows: 600, plan: 'paid' });
    const job = await w.start();
    await w.step(); // первая часть отработала: выпуск пошёл
    age(w, job.id, STUCK_AFTER_MS * 10);

    expect(await w.processor.sweepStuck()).toBe(0);
    expect(w.job().status).toBe('running');
  });

  it('если поднять не удаётся, задание помечается упавшим, а не висит дальше', async () => {
    const w = new World({ rows: 10, plan: 'paid' });
    const job = await w.start();
    w.queue.take();
    age(w, job.id, STUCK_AFTER_MS + 60_000);
    vi.spyOn(w.queue, 'addBulk').mockRejectedValue(new Error('Redis всё ещё не отвечает'));

    expect(await w.processor.sweepStuck()).toBe(0);
    expect(w.job().status).toBe('failed');
    expect(w.job().error).toContain('Продолжить');
  });
});

describe('признак «зависло» для экрана', () => {
  const base = { done: 0, failed: 0, startedAt: null };

  it('«в очереди» дольше срока и без единой строки — зависло', () => {
    const job = { ...base, status: 'queued', createdAt: new Date(Date.now() - STUCK_AFTER_MS - 1) };
    expect(isStuck(job)).toBe(true);
  });

  it('только что поставленное — не зависло', () => {
    expect(isStuck({ ...base, status: 'queued', createdAt: new Date() })).toBe(false);
  });

  it('начавшее печатать — не зависло, сколько бы ни шло', () => {
    const job = {
      ...base,
      status: 'queued',
      startedAt: new Date(),
      createdAt: new Date(Date.now() - STUCK_AFTER_MS * 100),
    };
    expect(isStuck(job)).toBe(false);
  });

  it('сделавшее хоть одну строку — не зависло', () => {
    const job = {
      ...base,
      status: 'queued',
      done: 1,
      createdAt: new Date(Date.now() - STUCK_AFTER_MS * 100),
    };
    expect(isStuck(job)).toBe(false);
  });

  it('завершённое и отменённое зависшими не считаются', () => {
    const old = new Date(Date.now() - STUCK_AFTER_MS * 100);
    expect(isStuck({ ...base, status: 'done', createdAt: old })).toBe(false);
    expect(isStuck({ ...base, status: 'canceled', createdAt: old })).toBe(false);
    expect(isStuck({ ...base, status: 'failed', createdAt: old })).toBe(false);
  });

  it('кабинет получает признак вместе с заданием', async () => {
    const w = new World({ rows: 10, plan: 'paid' });
    const job = await w.start();
    age(w, job.id, STUCK_AFTER_MS + 60_000);

    const shown = await controller(w).getJob(user(), job.id);
    expect(shown.stuck).toBe(true);
  });
});
