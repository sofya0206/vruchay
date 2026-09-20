import {
  BookOpen,
  Gift,
  GraduationCap,
  LifeBuoy,
  Map,
  MessageSquareQuote,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { onboarding } from '../onboarding/store';
import { sectionOf } from '../onboarding/sections';
import { track } from '../onboarding/track';

export type HelpItem =
  | { kind: 'divider' }
  | { kind: 'link'; label: string; to: string; icon: LucideIcon }
  | { kind: 'action'; label: string; icon: LucideIcon; run: () => void };

/**
 * Одно меню помощи на кабинет: колонка разделов, шапка телефона и бургер
 * берут список отсюда. Раньше три места показывали три разных набора.
 *
 * Первым — подсказки по открытому экрану, если у него они есть; затем
 * обучение и база знаний; затем поддержка, дорожная карта и отзыв;
 * последним — приглашение друга.
 */
export function helpItems(pathname: string, search: string): HelpItem[] {
  const section = sectionOf(pathname, search);
  const tips: HelpItem[] = section
    ? [
        {
          kind: 'action',
          label: 'Подсказки на этом экране',
          icon: Sparkles,
          run: () => {
            track({ flow: 'tips', step: `${section.key}.1`, action: 'shown' });
            onboarding.startTips(section.key);
          },
        },
      ]
    : [];
  return [
    ...tips,
    { kind: 'action', label: 'Обучение', icon: GraduationCap, run: () => onboarding.open() },
    { kind: 'link', label: 'База знаний', to: '/docs', icon: BookOpen },
    { kind: 'divider' },
    { kind: 'link', label: 'Написать в поддержку', to: '/support', icon: LifeBuoy },
    { kind: 'link', label: 'Что дальше', to: '/support#roadmap', icon: Map },
    { kind: 'link', label: 'Оценить сервис', to: '/support#review', icon: MessageSquareQuote },
    { kind: 'divider' },
    { kind: 'link', label: 'Пригласить друга', to: '/referral', icon: Gift },
  ];
}

/** Адреса, при которых пункт «Помощь» подсвечен. */
export const HELP_PATHS = ['/docs', '/support', '/referral'];
