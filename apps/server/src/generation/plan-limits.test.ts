import { describe, expect, it } from 'vitest';
import { World } from './generation.test-utils';
import { planRecord } from '../plans/plans.test-utils';

/*
 * Поведение выпуска на назначенном плане — то самое, ради чего плану быть
 * данными, а не кодом: приёмка задания 10-A целиком.
 *
 * Организации назначен план на 500 документов: выпуск идёт, счётчик
 * уменьшается, на девяноста процентах появляется предупреждение, при
 * исчерпании новый выпуск не начинается — но уже запущенный доходит
 * до конца.
 */

const DAY = 24 * 60 * 60_000;
const yesterday = () => new Date(Date.now() - DAY);

/** Мир с назначенным планом. Даты считаем от «сейчас»: тест не должен протухать. */
function worldWithPlan(rows: number, documentLimit: number, over = {}): World {
  const w = new World({ rows, plan: 'paid' });
  w.planRecords = [
    planRecord({ documentLimit, startsAt: yesterday(), endsAt: null, ...over }),
  ];
  return w;
}

describe('выпуск по назначенному плану', () => {
  it('идёт, пока в плане есть документы, и уменьшает остаток', async () => {
    const w = worldWithPlan(120, 500);

    await w.start();
    await w.drain();

    expect(w.used()).toBe(120);
    expect(w.job().status).toBe('done');

    const quota = await w.plans.quota('org-1');
    expect(quota.limit).toBe(500);
    expect(quota.left).toBe(380);
    expect(quota.warn).toBe('none');
  });

  it('на девяноста процентах предупреждает заранее', async () => {
    // Приёмка: «на 90% появляется предупреждение». Узнать о конце квоты
    // в день награждения — значит узнать поздно.
    const w = worldWithPlan(450, 500);
    await w.start();
    await w.drain();

    const quota = await w.plans.quota('org-1');
    expect(quota.left).toBe(50);
    expect(quota.warn).toBe('critical');
  });

  it('исчерпанный план не пускает новый выпуск и объясняет, что делать', async () => {
    const w = worldWithPlan(100, 100);
    await w.start();
    await w.drain();
    expect(w.used()).toBe(100);

    w.addDocument('doc-2', 5);
    await expect(w.start('doc-2')).rejects.toThrow(/израсходован/);
    await expect(w.start('doc-2')).rejects.toThrow(/обсудим условия/);
    // И ни одного лишнего документа при этом не выпущено.
    expect(w.used()).toBe(100);
  });

  it('пакет, который не помещается в остаток, отклоняется целиком до начала', async () => {
    // Узнать об исчерпанной квоте на сорок седьмом документе из пятидесяти —
    // это уже испорченное награждение.
    const w = worldWithPlan(200, 150);

    await expect(w.start()).rejects.toThrow(/осталось 150 документов из 150, а отмечено 200/);
    expect(w.jobs).toHaveLength(0);
  });

  it('бронь незаконченного выпуска считается занятой', async () => {
    // Иначе два пакета на остатке в сотню прошли бы оба: файлов
    // на момент проверки нет ни у одного.
    const w = worldWithPlan(80, 100);
    await w.start();

    w.addDocument('doc-2', 80);
    await expect(w.start('doc-2')).rejects.toThrow(/держит незаконченный выпуск/);
  });
});

describe('начатый пакет доводится до конца', () => {
  it('квота, кончившаяся посреди выпуска, его не обрывает', async () => {
    // Награждение уже идёт: половина участников получила документы,
    // половина ждёт. Оборвать пакет на середине — значит испортить
    // мероприятие ради цифры, которую всё равно уже не вернуть.
    const w = worldWithPlan(100, 100);
    const job = await w.start();

    await w.step();
    expect(w.used()).toBe(50);

    // Пока пакет идёт, план кончается: срок вышел.
    w.planRecords = [
      planRecord({ documentLimit: 100, startsAt: new Date(Date.now() - 2 * DAY), endsAt: yesterday() }),
    ];

    await w.drain();

    expect(w.used()).toBe(100);
    expect(w.job(job.id).done).toBe(100);
    expect(w.job(job.id).status).toBe('done');
  });

  it('но новый выпуск после этого не начинается', async () => {
    const w = worldWithPlan(50, 100);
    await w.start();
    await w.drain();

    w.planRecords = [
      planRecord({ documentLimit: 100, startsAt: new Date(Date.now() - 2 * DAY), endsAt: yesterday() }),
    ];
    w.addDocument('doc-2', 5);

    await expect(w.start('doc-2')).rejects.toThrow(/Срок плана/);
  });

  it('после окончания срока выданное остаётся выданным', async () => {
    // Документ на руках у участника не может протухнуть от того,
    // что у нас кончился договор. Об этом же говорит и сам отказ.
    const w = worldWithPlan(30, 100);
    await w.start();
    await w.drain();

    w.planRecords = [
      planRecord({ documentLimit: 100, startsAt: new Date(Date.now() - 2 * DAY), endsAt: yesterday() }),
    ];
    w.addDocument('doc-2', 1);

    expect(w.used()).toBe(30);
    expect(w.files.filter((f) => f.deletedAt !== null)).toHaveLength(0);
    await expect(w.start('doc-2')).rejects.toThrow(/остаются действительными/);
  });

  it('продолжение прерванного выпуска не упирается в собственную бронь', async () => {
    // «Продолжить» — не новый выпуск: платить второй раз за уже созданное
    // не за что, и остатка должно хватить ровно на недоделанное.
    const w = worldWithPlan(100, 100);
    const job = await w.start();
    await w.step();
    await w.service.cancel('org-1', job.id);

    await w.resume(job.id);
    await w.drain();

    expect(w.used()).toBe(100);
    expect(w.job(job.id).status).toBe('done');
  });
});
