import { z } from 'zod';

/**
 * Обучение в кабинете: слайды и точки у элементов.
 *
 * Словарь общий у кабинета и сервера: сервер принимает события только
 * с этими именами. Без списка любой мог бы записать в статистику что
 * угодно, а статистика — это решение о том, какой экран чинить.
 */

/** Слайды полноэкранного обучения, по порядку. */
export const GUIDE_SLIDES = ['document', 'table', 'fields', 'check', 'issue', 'qr', 'mail'] as const;
export type GuideSlide = (typeof GUIDE_SLIDES)[number];

/** Точки у мест первого столкновения. */
export const HINT_IDS = ['fields', 'import'] as const;
export type HintId = (typeof HINT_IDS)[number];

/**
 * `shown` — показали, `done` — сделали действие на слайде или закрыли
 * карточку точки «понятно», `closed` — закрыли обучение на этом слайде,
 * `missing` — места точки нет на экране (ошибка вёрстки, не отказ).
 */
export const ONBOARDING_ACTIONS = ['shown', 'done', 'closed', 'missing'] as const;
export const ONBOARDING_FLOWS = ['guide', 'hint'] as const;

export const onboardingEvent = z.object({
  flow: z.enum(ONBOARDING_FLOWS),
  step: z.enum([...GUIDE_SLIDES, ...HINT_IDS]),
  action: z.enum(ONBOARDING_ACTIONS),
});
export type OnboardingEvent = z.infer<typeof onboardingEvent>;

export const onboardingEvents = z.object({
  events: z.array(onboardingEvent).min(1).max(20),
});
