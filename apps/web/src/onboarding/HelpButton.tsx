import { CircleHelp } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { IconButton } from '../ui/IconButton';
import { sectionOf } from './sections';
import { onboarding } from './store';
import { track } from './track';

/**
 * «?» в шапке: подсказки по открытому разделу. Для разделов без своих
 * подсказок — полноэкранное обучение.
 */
export function HelpButton() {
  const { pathname, search } = useLocation();
  const section = sectionOf(pathname, search);
  return (
    <IconButton
      label={section ? `Подсказки: ${section.title}` : 'Обучение'}
      onClick={() => {
        if (!section) return onboarding.open();
        track({ flow: 'tips', step: `${section.key}.1`, action: 'shown' });
        onboarding.startTips(section.key);
      }}
      className="size-11"
    >
      <CircleHelp size={22} strokeWidth={1.75} />
    </IconButton>
  );
}
