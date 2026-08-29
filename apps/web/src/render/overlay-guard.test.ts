import { describe, expect, it } from 'vitest';
import { overlayProblem, probePoints, type ProbeDocument, type ProbeNode } from './overlay-guard';

/*
 * Дешёвая проверка страницы печати: «на листе нет посторонних узлов
 * поверх макета». Дорогая, растровая, лежит рядом в pdf-visual.test.ts
 * и требует браузера; эта идёт на каждый прогон.
 *
 * Проверяем оба направления, и второе не менее важно первого: страховка,
 * которая срабатывает на исправном документе, останавливает награждение
 * на ровном месте — а это дороже, чем один зелёный квадрат на грамоте.
 */

/** Узел, у которого есть предок-лист. */
const inSheet: ProbeNode = { closest: (selector) => (selector === '[data-sheet]' ? {} : null) };
/** Узел, лежащий поверх листа: заставка, баннер, окно расширения. */
const foreign: ProbeNode = { closest: () => null };

function page(options: { splash?: boolean; top?: ProbeNode | null }): ProbeDocument {
  return {
    getElementById: (id) => (options.splash && id === 'splash' ? {} : null),
    elementsFromPoint: () => (options.top === null ? [] : [options.top ?? inSheet]),
  };
}

const POINTS: [number, number][] = [
  [100, 100],
  [2, 2],
];

describe('поверх листа ничего нет', () => {
  it('лист сверху во всех точках — печатаем', () => {
    expect(overlayProblem(page({}), POINTS)).toBeNull();
  });

  it('заставка приложения названа отдельно: про неё сразу понятно, что делать', () => {
    const problem = overlayProblem(page({ splash: true }), POINTS);
    expect(problem).toContain('заставка');
  });

  it('заставка ловится и тогда, когда сверху в точках всё честно', () => {
    // Именно этот случай и был в бою: заставка появляется через треть
    // секунды, и в момент проверки точек могла быть ещё прозрачной.
    expect(overlayProblem(page({ splash: true, top: inSheet }), POINTS)).not.toBeNull();
  });

  it('посторонний слой поверх листа — не печатаем', () => {
    const problem = overlayProblem(page({ top: foreign }), POINTS);
    expect(problem).toContain('посторонний');
  });

  it('в точке нет ни одного узла — лист не отрисован, печатать нечего', () => {
    expect(overlayProblem(page({ top: null }), POINTS)).not.toBeNull();
  });

  it('листа на странице не нашлось — это тоже отказ, а не разрешение', () => {
    // Пустой список точек означает «лист не найден». Считать это
    // «проверять нечего, печатаем» — значит вернуть ровно ту дыру,
    // ради которой проверка и написана.
    expect(overlayProblem(page({}), [])).not.toBeNull();
  });
});

describe('точки, в которых спрашиваем', () => {
  const viewport = { width: 794, height: 559 };

  it('середина и четыре угла', () => {
    const points = probePoints({ left: 0, top: 0, width: 794, height: 559 }, viewport);
    expect(points).toHaveLength(5);
    expect(points).toContainEqual([397, 279.5]);
  });

  it('углы берутся с отступом внутрь: ровно на границе браузер вправе вернуть что угодно', () => {
    const points = probePoints({ left: 0, top: 0, width: 794, height: 559 }, viewport);
    expect(points).toContainEqual([2, 2]);
    expect(points).toContainEqual([792, 557]);
  });

  it('точки за краем окна отбрасываются, а не спрашиваются впустую', () => {
    // Лист выше окна — обычное дело для документа из нескольких листов.
    const points = probePoints({ left: 0, top: 0, width: 794, height: 2000 }, viewport);
    expect(points.every(([, y]) => y < viewport.height)).toBe(true);
    // Верхние два угла и середина листа за краем не остались бы вовсе —
    // хоть что-то спросить мы обязаны.
    expect(points.length).toBeGreaterThan(0);
  });
});
