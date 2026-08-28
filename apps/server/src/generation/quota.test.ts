import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { GenerationController } from './generation.controller';
import { World } from './generation.test-utils';

/*
 * Где именно списывается квота.
 *
 * Правило одно и оно денежное: документ считается выпущенным в тот момент,
 * когда о нём появилась запись в таблице файлов, — и больше нигде и никогда.
 * Ни повторный запуск воркера, ни второй воркер, ни скачивание архива
 * в третий раз не должны прибавить организации ни одного израсходованного
 * документа.
 *
 * Проверять это на живой базе долго, а ошибиться здесь дорого: лишний
 * списанный документ на бесплатной пробе — это остановленное награждение,
 * а недосписанный на платном тарифе — наши деньги.
 */

describe('квота списывается в момент генерации', () => {
  it('за пакет из десяти строк списано ровно десять документов', async () => {
    const w = new World({ rows: 10 });
    await w.start();
    await w.drain();

    expect(w.used()).toBe(10);
    expect(w.job().done).toBe(10);
    expect(w.job().status).toBe('done');
  });

  it('строка, которую не удалось отрисовать, квоту не занимает', async () => {
    const w = new World({ rows: 5, renderFails: [3] });
    await w.start();
    await w.drain();

    expect(w.used()).toBe(4);
    expect(w.job().done).toBe(4);
    expect(w.job().failed).toBe(1);
    // Задание не считается упавшим: четыре человека документы получили.
    expect(w.job().status).toBe('done');
  });

  it('пакет из шестисот строк режется на части, и все они оплачены по разу', async () => {
    const w = new World({ rows: 600, plan: 'paid' });
    const job = await w.start();

    expect(job.chunks).toBe(12);
    await w.drain();

    expect(w.used()).toBe(600);
    expect(w.job().done).toBe(600);
    expect(w.job().status).toBe('done');
  });
});

describe('файл не существует раньше своих байтов', () => {
  /*
   * Прежний порядок — сначала запись в базе, потом загрузка в хранилище —
   * держался на компенсации в catch. При убийстве воркера по памяти
   * (ровно том случае, ради которого поднят maxStalledCount) catch
   * не выполняется, и запись оставалась навсегда: квота списана, документа
   * нет, повторно строка не печатается, а скачивание архива обрывается
   * на середине уже начатого ответа.
   */

  it('отказ хранилища не оставляет записи, за которую списана квота', async () => {
    const w = new World({ rows: 4, putFails: [2] });
    await w.start();
    await w.drain();

    expect(w.used()).toBe(3);
    expect(w.job().failed).toBe(1);
  });

  it('отказ базы после загрузки не оставляет байтов без хозяина', async () => {
    const w = new World({ rows: 4, createFails: [2] });
    await w.start();
    await w.drain();

    expect(w.used()).toBe(3);
    // Загруженные впустую байты убраны из хранилища сразу же.
    expect(w.calls.removed).toBe(1);
  });

  it('ни одной записи с пустым ключом хранилища не появляется', async () => {
    const w = new World({ rows: 6, putFails: [2], createFails: [4] });
    await w.start();
    await w.drain();

    expect(w.files.filter((f) => f.s3Key === '')).toHaveLength(0);
    // Каждая запись — это скачиваемый документ, и наоборот.
    expect(w.used()).toBe(w.files.filter((f) => f.s3Key !== '').length);
  });

  it('запись, оставшаяся от прежнего порядка, не мешает выпустить строку', async () => {
    const w = new World({ rows: 3 });
    const job = await w.start();
    // Так выглядела бы строка, убитая по памяти между записью и загрузкой.
    w.files.push({
      id: 'legacy',
      orgId: 'org-1',
      documentId: 'doc-1',
      jobId: job.id,
      rowId: 'doc-1-row-2',
      kind: 'generated',
      s3Key: '',
      mime: 'application/pdf',
      sizeBytes: 0,
      publicId: 'legacy',
      originalName: '',
      deletedAt: null,
      createdAt: new Date(),
    });

    await w.drain();

    // Строку выпустили заново, а не сочли готовой.
    const real = w.files.filter((f) => f.rowId === 'doc-1-row-2' && f.s3Key !== '');
    expect(real).toHaveLength(1);
    expect(w.job().status).toBe('done');
  });
});

describe('идемпотентность по (batchId, rowId)', () => {
  it('повторная выдача той же части не создаёт ни одного файла заново', async () => {
    const w = new World({ rows: 6 });
    const job = await w.start();
    await w.drain();
    const rendersAfterFirst = w.calls.render;

    // BullMQ отдал часть второй раз: так бывает после перезапуска воркера.
    await (w.processor as unknown as { process(d: unknown): Promise<void> }).process({
      jobId: job.id,
      index: 0,
      rowIds: w.rows.map((r) => r.id),
    });

    expect(w.used()).toBe(6);
    // И главное — второй раз ничего даже не печаталось: страница в браузере
    // стоит дороже всего остального вместе взятого.
    expect(w.calls.render).toBe(rendersAfterFirst);
  });

  it('второй воркер на той же строке не выпускает второй документ', async () => {
    const w = new World({ rows: 3 });
    await w.start();

    // Пока первый воркер печатает вторую строку, её успевает выпустить
    // другой процесс — так выглядит протухшая блокировка BullMQ.
    const file = w.prisma as { file: { create: (a: { data: never }) => Promise<unknown> } };
    const create = file.file.create.bind(file.file);
    let injected = false;
    file.file.create = async (args: { data: { rowId?: string; id?: string } }) => {
      if (!injected && args.data.rowId === 'doc-1-row-2') {
        injected = true;
        await create({ ...args, data: { ...args.data, id: 'other-worker' } } as never);
      }
      return create(args as never);
    };

    await w.drain();

    expect(w.used()).toBe(3);
    expect(w.job().done).toBe(3);
    // Столкновение — не ошибка выпуска: документ у участника есть.
    expect(w.job().failed).toBe(0);
    // Наши байты после столкновения из хранилища убраны.
    expect(w.calls.removed).toBe(1);
  });
});

describe('продолжение прерванного выпуска', () => {
  it('доделывает с того места, где встало, и не платит за уже созданное', async () => {
    const w = new World({ rows: 120, plan: 'paid' });
    const job = await w.start();
    expect(job.chunks).toBe(3);

    // Первая часть отработала, и воркера убили.
    await w.step();
    expect(w.used()).toBe(50);

    // Очередь исчерпала попытки и отказалась от задания.
    await (
      w.processor as unknown as { giveUp(id: string, e: Error): Promise<void> }
    ).giveUp(job.id, new Error('воркер убит по памяти'));
    expect(w.job().status).toBe('failed');

    // Человек нажимает «Продолжить».
    const rendersBefore = w.calls.render;
    await w.resume(job.id);
    await w.drain();

    expect(w.used()).toBe(120);
    expect(w.job().done).toBe(120);
    expect(w.job().status).toBe('done');
    // Допечатано ровно семьдесят — полсотни готовых не перепечатывались
    // и, главное, не оплачивались второй раз.
    expect(w.calls.render - rendersBefore).toBe(70);
  });

  it('продолжение отменённого выпуска доделывает остаток', async () => {
    const w = new World({ rows: 100, plan: 'paid' });
    const job = await w.start();
    await w.step();
    await w.service.cancel('org-1', job.id);

    await w.resume(job.id);
    await w.drain();

    expect(w.used()).toBe(100);
    expect(w.job().status).toBe('done');
  });

  it('продолжать законченный выпуск нечего', async () => {
    const w = new World({ rows: 5 });
    const job = await w.start();
    await w.drain();

    await expect(w.service.resume('org-1', job.id)).rejects.toThrow(/уже завершён/);
  });

  it('снятые отметки продолжение уважает: навязывать документы не за что', async () => {
    const w = new World({ rows: 100, plan: 'paid' });
    const job = await w.start();
    await w.step();
    await w.service.cancel('org-1', job.id);

    // Человек передумал: остаток списка ему больше не нужен.
    for (const row of w.rows.slice(50)) row.checked = false;

    await w.resume(job.id);
    await w.drain();

    expect(w.used()).toBe(50);
    expect(w.job().status).toBe('done');
    expect(w.job().total).toBe(50);
  });
});

describe('отмена батча', () => {
  it('останавливает выпуск и не списывает квоту за необработанные строки', async () => {
    const w = new World({
      rows: 200,
      plan: 'paid',
      beforeRender: (n, world) => {
        // Человек нажал «Отменить», пока печаталась четвёртая строка.
        if (n === 4) {
          const job = world.job();
          job.status = 'canceled';
        }
      },
    });
    const job = await w.start();
    await w.drain();

    expect(w.used()).toBe(4);
    expect(w.job().status).toBe('canceled');
    // Остальные строки не печатались и квоту не тронули.
    expect(w.calls.render).toBe(4);
    expect(job.total).toBe(200);
  });

  it('снятые с очереди части не допечатывают документы после отмены', async () => {
    const w = new World({ rows: 200, plan: 'paid' });
    const job = await w.start();
    await w.step();

    const { job: canceled } = await w.service.cancel('org-1', job.id);
    await w.processor.dequeue(job.id, canceled.attempt, canceled.chunks);

    expect(w.queue.size).toBe(0);
    await w.drain();
    expect(w.used()).toBe(50);
  });

  it('возвращённая квота — это строки, до которых не дошли', async () => {
    const w = new World({ rows: 200, plan: 'paid' });
    const job = await w.start();
    await w.step();

    const { refunded } = await w.service.cancel('org-1', job.id);

    expect(w.used()).toBe(50);
    expect(refunded).toBe(150);
  });

  it('завершённое задание отменить нельзя — отменять уже нечего', async () => {
    const w = new World({ rows: 3 });
    const job = await w.start();
    await w.drain();

    await expect(w.service.cancel('org-1', job.id)).rejects.toThrow(/уже завершено/);
  });
});

describe('скачивание готового пакета', () => {
  /** Ответ Fastify: архив надо вычитать, иначе поток встанет на противодавлении. */
  function fakeReply() {
    const captured: { body: Buffer | null } = { body: null };
    const reply = {
      header: () => reply,
      send: (body: unknown) => {
        if (body && typeof (body as Readable).on === 'function') {
          (body as Readable).on('data', () => undefined);
        } else if (Buffer.isBuffer(body)) {
          captured.body = body;
        }
        return reply;
      },
      captured,
    };
    return reply;
  }

  function controllerFor(w: World, page: Buffer, limits?: Record<string, number>) {
    const storage = { getStream: async () => Readable.from([page]) };
    const config = {
      get: (key: string) =>
        limits?.[key] ?? (key === 'PRINT_MERGE_LIMIT_FILES' ? 300 : 150),
    };
    return new GenerationController(
      w.service,
      w.processor,
      storage as never,
      { record: async () => undefined } as never,
      config as never,
    );
  }

  /** Настоящий PDF в одну страницу: склейка разбирает файлы, а не верит расширению. */
  async function onePagePdf(): Promise<Buffer> {
    const doc = await PDFDocument.create();
    doc.addPage([595, 842]);
    return Buffer.from(await doc.save());
  }

  it('повторное скачивание архива не проверяет и не списывает квоту заново', async () => {
    const w = new World({ rows: 5 });
    const job = await w.start();
    await w.drain();
    expect(w.used()).toBe(5);

    // Проверка лимита читает организацию — если её никто не спросил, значит
    // проверки не было. В этом и смысл правила: платят за выпуск,
    // а не за скачивание.
    let limitChecks = 0;
    (w.prisma as { organization: { findUnique: () => Promise<unknown> } }).organization.findUnique =
      async () => {
        limitChecks++;
        return { id: 'org-1', plan: 'free' };
      };

    const controller = controllerFor(w, await onePagePdf());
    for (let i = 0; i < 2; i++) {
      await controller.archive(
        { orgId: 'org-1' } as never,
        job.id,
        { format: 'zip' },
        fakeReply() as never,
      );
    }

    expect(w.used()).toBe(5);
    expect(limitChecks).toBe(0);
  });

  it('общий PDF на печать — тоже скачивание: квота не меняется', async () => {
    const w = new World({ rows: 3 });
    const job = await w.start();
    await w.drain();

    const controller = controllerFor(w, await onePagePdf());
    const reply = fakeReply();
    await controller.archive({ orgId: 'org-1' } as never, job.id, { format: 'pdf' }, reply as never);

    expect(w.used()).toBe(3);
    const merged = await PDFDocument.load(reply.captured.body!);
    expect(merged.getPageCount()).toBe(3);
  });

  it('чужое задание не отдаётся: 404, а не 403', async () => {
    // Подтверждать существование чужого задания нельзя — см. CLAUDE.md.
    const w = new World({ rows: 2 });
    const job = await w.start();
    await w.drain();

    const controller = controllerFor(w, await onePagePdf());
    await expect(
      controller.archive(
        { orgId: 'org-2' } as never,
        job.id,
        { format: 'zip' },
        fakeReply() as never,
      ),
    ).rejects.toThrow(/не найдено/);
  });

  it('запись без байтов в архив не попадает и не рвёт его на середине', async () => {
    const w = new World({ rows: 2 });
    const job = await w.start();
    await w.drain();
    w.files.push({
      id: 'legacy',
      orgId: 'org-1',
      documentId: 'doc-1',
      jobId: job.id,
      rowId: null,
      kind: 'generated',
      s3Key: '',
      mime: 'application/pdf',
      sizeBytes: 0,
      publicId: 'legacy',
      originalName: 'Битый.pdf',
      deletedAt: null,
      createdAt: new Date(),
    });

    const files = await w.service.jobFiles('org-1', job.id);
    expect(files).toHaveLength(2);
    expect(files.every((f) => f.s3Key !== '')).toBe(true);
  });
});
