import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { priorityFor, CHUNK_SIZE } from './generation.processor';
import { World } from './generation.test-utils';

/*
 * Порядок в очереди и место в ней.
 *
 * Обе проверки про одно: воркер один, и всё, что он успеет сделать за день,
 * поделено между всеми организациями сразу. Маленький пакет не должен
 * стоять за чужой тысячей, а одна организация не должна занимать очередь
 * целиком.
 */

describe('маленький пакет не ждёт запущенный большой', () => {
  /*
   * Это критерий приёмки, и проверять его надо поведением.
   *
   * Одних приоритетов мало, и предыдущая проверка этого не ловила: она
   * сравнивала числа, которые возвращает priorityFor, и была зелёной при
   * неработающей возможности. Приоритет расставляет только те задачи,
   * что ещё не начаты; пакет, взятый в работу целиком, держал бы воркер
   * до последней строки, и пакет на пять грамот ждал бы часы.
   *
   * Работает только пара: приоритет и разрезание пакета на части.
   * Поэтому здесь очередь отдаёт задачи по правилам BullMQ, а проверяется
   * не число, а факт — кто раньше дошёл до конца.
   */

  it('пакет на пять грамот заканчивается раньше начатого пакета на триста', async () => {
    const w = new World({ plan: 'paid' });
    w.addDocument('big', 300);
    w.addDocument('small', 5);

    const big = await w.start('big');

    // Большой пакет уже в работе — и, главное, воркер после первой порции
    // работы свободен. Пока пакет был одной задачей, здесь было бы «done»:
    // воркер уходил в него на все триста строк и ни на что не отвлекался.
    await w.step();
    expect(w.job(big.id).status).toBe('running');
    expect(w.job(big.id).done).toBeLessThan(300);

    // Человек с пятью грамотами приходит, когда чужая тысяча уже печатается.
    const small = await w.start('small');

    // Считаем, сколько частей пройдёт до того, как маленький пакет закроется.
    let stepsUntilSmallDone = 0;
    while (w.job(small.id).status !== 'done') {
      if (!(await w.step())) break;
      stepsUntilSmallDone++;
    }

    // Свою единственную часть маленький пакет отработал следующим же ходом:
    // чужие пять частей ждать не пришлось.
    expect(stepsUntilSmallDone).toBe(1);
    expect(w.job(small.id).status).toBe('done');
    // А большой в этот момент ещё далеко не закончен — и закончился позже.
    expect(w.job(big.id).done).toBeLessThan(300);
    expect(w.finished[0]).toBe(small.id);
  });

  it('пакет на триста строк режется на шесть частей по полсотни', async () => {
    const w = new World({ plan: 'paid' });
    w.addDocument('big', 300);
    const big = await w.start('big');
    expect(big.chunks).toBe(300 / CHUNK_SIZE);
  });

  it('в конце оба пакета доходят до конца целиком', async () => {
    const w = new World({ plan: 'paid' });
    w.addDocument('big', 300);
    w.addDocument('small', 5);

    const big = await w.start('big');
    await w.step();
    const small = await w.start('small');
    await w.drain();

    expect(w.job(big.id).done).toBe(300);
    expect(w.job(big.id).status).toBe('done');
    expect(w.job(small.id).done).toBe(5);
    expect(w.job(small.id).status).toBe('done');
    // Ни одной лишней отрисовки: маленький пакет не заставил
    // перепечатывать чужие строки.
    expect(w.calls.render).toBe(305);
  });

  it('пакеты одного размера идут живой очередью, а не наперегонки', async () => {
    const w = new World({ plan: 'paid' });
    w.addDocument('first', 5);
    w.addDocument('second', 5);

    const first = await w.start('first');
    const second = await w.start('second');
    await w.drain();

    expect(w.finished).toEqual([first.id, second.id]);
  });
});

describe('приоритет по размеру пакета', () => {
  it('чем меньше пакет, тем раньше очередь', () => {
    // У BullMQ меньшее число — более высокий приоритет.
    expect(priorityFor(5)).toBeLessThan(priorityFor(30));
    expect(priorityFor(30)).toBeLessThan(priorityFor(120));
    expect(priorityFor(120)).toBeLessThan(priorityFor(1000));
  });

  it('пакеты одного порядка не соревнуются между собой', () => {
    // Иначе пакет из 501 строки обгонял бы поставленный часом раньше пакет
    // из 500, и очередь перестала бы быть очередью.
    expect(priorityFor(500)).toBe(priorityFor(501));
    expect(priorityFor(1)).toBe(priorityFor(10));
  });

  it('у самой большой пачки приоритет всё-таки есть — она не выпадает из очереди', () => {
    expect(priorityFor(100_000)).toBeGreaterThan(0);
  });

  it('все части пакета получают приоритет по размеру пакета, а не части', async () => {
    // Иначе последняя часть большого пакета шла бы как маленький пакет
    // и обгоняла бы тех, кто честно ждал.
    const w = new World({ plan: 'paid' });
    w.addDocument('big', 300);
    const big = await w.start('big');
    expect(big.chunks).toBe(6);

    w.addDocument('small', 5);
    const small = await w.start('small');
    await w.drain();

    expect(w.finished[0]).toBe(small.id);
  });
});

describe('лимит одновременных заданий на организацию', () => {
  beforeEach(() => {
    process.env.FREE_DOCUMENT_LIMIT = '10000';
  });
  afterEach(() => {
    delete process.env.FREE_DOCUMENT_LIMIT;
    delete process.env.ORG_ACTIVE_JOBS;
  });

  async function withActiveJobs(count: number): Promise<World> {
    const w = new World({ plan: 'paid' });
    for (let i = 0; i < count; i++) {
      w.addDocument(`doc-${i}`, 5);
      await w.start(`doc-${i}`);
    }
    w.addDocument('one-more', 5);
    return w;
  }

  it('три незаконченных пакета — предел, четвёртый не принимается', async () => {
    const w = await withActiveJobs(3);
    await expect(w.start('one-more')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('в отказе сказано, что уже созданное при отмене не пропадёт', async () => {
    // Иначе человек не отменит лишний пакет, боясь потерять сделанное,
    // и будет ждать вместо того, чтобы работать.
    const w = await withActiveJobs(3);
    await expect(w.start('one-more')).rejects.toThrow(/при отмене никуда/);
  });

  it('два незаконченных пакета пределу не мешают', async () => {
    const w = await withActiveJobs(2);
    await expect(w.start('one-more')).resolves.toBeDefined();
  });

  it('законченный пакет место освобождает', async () => {
    const w = await withActiveJobs(3);
    await w.drain();
    await expect(w.start('one-more')).resolves.toBeDefined();
  });

  it('предел настраивается', async () => {
    process.env.ORG_ACTIVE_JOBS = '1';
    const w = await withActiveJobs(1);
    await expect(w.start('one-more')).rejects.toThrow(/не больше 1 пакетов/);
  });

  it('продолжение прерванного пакета местом в лимите не считается дважды', async () => {
    // Иначе организация с тремя пакетами не смогла бы доделать ни один
    // из них: своё же задание считалось бы четвёртым.
    process.env.ORG_ACTIVE_JOBS = '1';
    const w = new World({ plan: 'paid' });
    w.addDocument('only', 100);
    const job = await w.start('only');
    await w.step();
    await w.service.cancel('org-1', job.id);

    await expect(w.service.resume('org-1', job.id)).resolves.toBeDefined();
  });
});

describe('бронь незаконченных заданий', () => {
  beforeEach(() => {
    process.env.FREE_DOCUMENT_LIMIT = '50';
  });
  afterEach(() => {
    delete process.env.FREE_DOCUMENT_LIMIT;
  });

  it('второй пакет не пролезает мимо лимита, пока первый не напечатан', async () => {
    // Проба на 50. Первый пакет на 30 строк ещё не напечатан, файлов нет
    // ни одного — но свои 30 он уже занял, и второй на 30 принимать нельзя.
    const w = new World();
    w.addDocument('first', 30);
    w.addDocument('second', 30);
    await w.start('first');

    await expect(w.start('second')).rejects.toThrow(/осталось 20 документов/);
  });

  it('в отказе объяснено, что место занято незаконченным выпуском', async () => {
    // «Выпущено 30 из 50» при пустом списке файлов выглядит поломкой
    // сервиса, а не занятым местом.
    const w = new World();
    w.addDocument('first', 30);
    w.addDocument('second', 30);
    await w.start('first');

    await expect(w.start('second')).rejects.toThrow(/держит незаконченный выпуск/);
  });

  it('напечатанные строки брони не держат — они уже в файлах', async () => {
    const w = new World();
    w.addDocument('first', 30);
    w.addDocument('second', 20);
    await w.start('first');
    await w.drain();

    // 30 в файлах, брони нет, 20 новых — ровно 50.
    await expect(w.start('second')).resolves.toBeDefined();
  });

  it('отменённое задание бронь отпускает', async () => {
    const w = new World();
    w.addDocument('first', 40);
    w.addDocument('second', 40);
    const first = await w.start('first');
    await w.service.cancel('org-1', first.id);

    await expect(w.start('second')).resolves.toBeDefined();
  });

  it('на оплаченном тарифе бронь ничего не ограничивает', async () => {
    const w = new World({ plan: 'paid' });
    w.addDocument('first', 5_000);
    w.addDocument('second', 5_000);
    await w.start('first');

    await expect(w.start('second')).resolves.toBeDefined();
  });
});
