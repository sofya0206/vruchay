import { describe, expect, it } from 'vitest';
import { World } from './generation.test-utils';

/*
 * Общая беда против плохой строки.
 *
 * Приёмка 28.08.2026: сломай хранилище — и пакет на триста строк
 * за несколько секунд выдаёт триста одинаковых записей «Документ
 * не удалось создать». Понять по такому отчёту нечего, а сервис успевает
 * перемолоть весь список, прежде чем человек заметит.
 *
 * Разница здесь не в тексте, а в поведении: одна плохая строка попадает
 * в отчёт поимённо и выпуск продолжается, а сломанное хранилище или
 * упавший браузер останавливают выпуск и называют причину.
 *
 * Ошибиться можно в обе стороны, и вторая хуже: остановка на исправном
 * сервисе — это прерванное награждение. Поэтому проверяем и её.
 */

/** Все отправки в хранилище, сколько бы их ни было. */
const ALL = Array.from({ length: 500 }, (_, i) => i + 1);

describe('умершее хранилище останавливает выпуск', () => {
  it('одна осечка хранилища выпуск не роняет: строку сервис повторит сам', async () => {
    // Обратная сторона остановки, и она дороже: пакет на тысячу человек,
    // прерванный из-за одной моргнувшей записи, — это сорванное награждение.
    const w = new World({ rows: 20, plan: 'paid', putFails: [7] });
    await w.start();
    await w.drain();

    expect(w.job().status).toBe('done');
    expect(w.job().done).toBe(19);
  });

  it('в отчёт уходит одна строка, а не весь список', async () => {
    const w = new World({ rows: 30, plan: 'paid', putFails: ALL });
    await w.start();
    await w.drain();

    expect(w.job().status).toBe('failed');
    // Две попытки, а не тридцать: одну неудачу списываем на случайность,
    // вторая подряд с той же причиной — уже не строка, а хранилище.
    expect(w.failures).toHaveLength(2);
    expect(w.calls.render).toBe(2);
  });

  it('человек читает причину, а не «документ не удалось создать»', async () => {
    const w = new World({ rows: 30, plan: 'paid', putFails: ALL });
    const job = await w.start();
    await w.drain();

    const report = await w.service.jobFailures('org-1', job.id);
    expect(report[0].reason).toContain('Хранилище');
    expect(w.job().error).toContain('хранилище');
  });

  it('оставшиеся части не начинают работу впустую', async () => {
    // Шестьсот строк — двенадцать частей. Без остановки одиннадцать
    // из них честно перебрали бы свои полсотни строк каждая.
    const w = new World({ rows: 600, plan: 'paid', putFails: ALL });
    await w.start();
    await w.drain();

    expect(w.job().status).toBe('failed');
    expect(w.calls.render).toBe(2);
  });

  it('бронь квоты освобождается: задание больше не активно', async () => {
    const w = new World({ rows: 30, plan: 'paid', putFails: ALL });
    await w.start();
    await w.drain();

    // Пока задание держалось в «queued», оно занимало место в лимите
    // организации и не давало начать ничего другого.
    await expect(w.start()).resolves.toBeTruthy();
  });
});

describe('упавший браузер останавливает выпуск', () => {
  it('названо своими словами и не превращается в триста строк отчёта', async () => {
    const w = new World({
      rows: 40,
      plan: 'paid',
      renderFails: ALL,
      renderError: 'Target page, context or browser has been closed',
    });
    const job = await w.start();
    await w.drain();

    expect(w.job().status).toBe('failed');
    expect(w.failures).toHaveLength(2);
    const report = await w.service.jobFailures('org-1', job.id);
    expect(report[0].reason).toContain('Браузер');
  });
});

describe('незнакомая причина: считаем неудачи подряд', () => {
  it('пять подряд — останавливаемся, а не мелем список до конца', async () => {
    const w = new World({ rows: 40, plan: 'paid', renderFails: [1, 2, 3, 4, 5] });
    await w.start();
    await w.drain();

    expect(w.job().status).toBe('failed');
    expect(w.failures).toHaveLength(5);
    // Шестая строка уже не печаталась.
    expect(w.calls.render).toBe(5);
  });

  it('счётчик сбрасывается удачей: редкие неудачи выпуск не останавливают', async () => {
    // Четыре плохие строки вперемешку с хорошими — это не поломка сервиса,
    // а обычный список, и награждение должно состояться.
    const w = new World({ rows: 20, plan: 'paid', renderFails: [2, 5, 9, 14] });
    await w.start();
    await w.drain();

    expect(w.job().status).toBe('done');
    expect(w.job().done).toBe(16);
    expect(w.job().failed).toBe(4);
  });

  it('одна плохая строка не мешает остальным', async () => {
    const w = new World({ rows: 10, plan: 'paid', renderFails: [3] });
    await w.start();
    await w.drain();

    expect(w.job().status).toBe('done');
    expect(w.job().done).toBe(9);
  });
});
