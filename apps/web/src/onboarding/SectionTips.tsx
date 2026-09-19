import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { Coach } from './Coach';
import { SECTIONS, findAnchor } from './sections';
import { onboarding, useOnboarding } from './store';
import { track } from './track';

/**
 * Подсказки по разделу — карточка со стрелками у настоящего элемента.
 * Запускаются кнопкой «?» в шапке; ушли в другой раздел — закончились.
 */
export function SectionTips() {
  const { tips } = useOnboarding();
  const { pathname, search } = useLocation();
  const where = useRef(`${pathname}${search}`);

  useEffect(() => {
    if (!tips) where.current = `${pathname}${search}`;
    else if (where.current !== `${pathname}${search}`) onboarding.endTips();
  }, [tips, pathname, search]);

  if (!tips) return null;
  const section = SECTIONS.find((s) => s.key === tips.key);
  const step = section?.steps[tips.index];
  if (!section || !step) return null;
  const total = section.steps.length;
  const id = `${section.key}.${tips.index + 1}`;

  const next = () => {
    track({ flow: 'tips', step: id, action: 'done' });
    onboarding.stepTips(tips.index + 1, total);
  };

  return (
    <Coach
      key={id}
      hint={step}
      anchor={() => findAnchor(step.at)}
      step={{ index: tips.index, total }}
      onNext={next}
      onBack={tips.index > 0 ? () => onboarding.stepTips(tips.index - 1, total) : undefined}
      onClose={() => {
        track({ flow: 'tips', step: id, action: 'closed' });
        onboarding.endTips();
      }}
      onMissing={() => {
        track({ flow: 'tips', step: id, action: 'missing' });
        onboarding.stepTips(tips.index + 1, total);
      }}
    />
  );
}
