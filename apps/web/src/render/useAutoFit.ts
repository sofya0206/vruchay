import { useEffect, useLayoutEffect, useState, type RefObject } from 'react';
import { fitSteps, NO_FIT, type FitStep } from '@gramota/shared';

/**
 * Подгонка текста под блок — по лестнице из `fitSteps`, измерением в DOM.
 *
 * Это тот же браузер, что печатает PDF, поэтому подгонка на холсте
 * и на печати одна и та же по построению: обе идут по одним ступеням
 * и обе спрашивают «вылезло ли» у самого движка вёрстки. Измеритель
 * на сервере повторяет эти ступени без браузера, чтобы предупредить
 * заранее, — а решает всегда браузер.
 *
 * Ступень подбирается перерисовками: применили ступень, померили,
 * если вылезает — следующая. Ступеней десяток, и это заметно только
 * измерителю, а не глазу. Пока идёт подбор, у блока стоит `data-fitting`:
 * страница печати ждёт, когда он снимется, прежде чем объявить готовность.
 *
 * Пока блок правится, подгонка замирает на текущей ступени: текст
 * не должен прыгать под каретой. По выходу из правки — подбирается заново.
 */
export function useAutoFit(
  ref: RefObject<HTMLElement | null>,
  enabled: boolean,
  lineHeight: number,
  deps: unknown[],
  frozen = false,
): FitStep {
  const [index, setIndex] = useState(0);
  const [fontsReady, setFontsReady] = useState(false);
  const steps = enabled ? fitSteps(lineHeight) : [NO_FIT];

  // Мерить до загрузки шрифтов нельзя: запасной шрифт другой ширины,
  // и ступень подобралась бы не под тот текст, что напечатается.
  useEffect(() => {
    if (typeof document === 'undefined' || !('fonts' in document)) {
      setFontsReady(true);
      return;
    }
    let alive = true;
    void document.fonts.ready.then(() => alive && setFontsReady(true));
    return () => {
      alive = false;
    };
  }, []);

  // Содержимое или оформление поменялось — подбираем с начала. Под правкой
  // сброса нет: ступень держится, а по выходу из правки подбор начнётся
  // заново, потому что `frozen` сам входит в зависимости.
  useLayoutEffect(() => {
    if (!frozen) setIndex(0);
  }, [...deps, frozen]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!enabled || !fontsReady || frozen) {
      el.removeAttribute('data-fitting');
      return;
    }
    const overflows = el.scrollHeight > el.clientHeight + 0.5 || el.scrollWidth > el.clientWidth + 0.5;
    if (overflows && index < steps.length - 1) {
      el.setAttribute('data-fitting', '');
      setIndex(index + 1);
      return;
    }
    el.removeAttribute('data-fitting');
  });

  return steps[Math.min(index, steps.length - 1)];
}

/** Все блоки страницы подобрали ступень — или вышло время ждать. */
export function whenFitsSettle(timeoutMs = 3000): Promise<void> {
  return new Promise((resolve) => {
    const started = Date.now();
    const check = () => {
      if (!document.querySelector('[data-fitting]') || Date.now() - started > timeoutMs) resolve();
      else setTimeout(check, 30);
    };
    check();
  });
}
