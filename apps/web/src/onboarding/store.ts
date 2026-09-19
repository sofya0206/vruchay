import { useSyncExternalStore } from 'react';
import { HINT_IDS, type HintId } from '@gramota/shared';

/**
 * Обучение: открыто ли оно и какие точки уже погасли.
 *
 * Само ничего не показывает: обучение открывают кнопкой в меню, карточку
 * точки — нажатием на точку. Погасшие точки запоминаются в браузере по
 * почте, как тема и плотность: знание интерфейсное и своё у каждого.
 */
export interface OnboardingState {
  email: string | null;
  /** Открытый слайд обучения; null — обучение закрыто. */
  slide: number | null;
  /** Карточка точки, которую попросили нажатием. */
  hint: HintId | null;
  seen: HintId[];
  /** Подсказки по разделу: какой раздел и какой шаг. */
  tips: { key: string; index: number } | null;
}

const KEY = 'vruchay:onboarding';
let state: OnboardingState = { email: null, slide: null, hint: null, seen: [], tips: null };
const listeners = new Set<() => void>();

function read(email: string): HintId[] {
  try {
    const raw = JSON.parse(localStorage.getItem(`${KEY}:${email}`) ?? '[]') as unknown;
    return Array.isArray(raw) ? raw.filter((id): id is HintId => (HINT_IDS as readonly string[]).includes(id)) : [];
  } catch {
    return [];
  }
}

function set(patch: Partial<OnboardingState>) {
  state = { ...state, ...patch };
  if (patch.seen && state.email) {
    try {
      localStorage.setItem(`${KEY}:${state.email}`, JSON.stringify(state.seen));
    } catch {
      // Не сохранилось — точка покажется снова после перезагрузки, и только.
    }
  }
  for (const l of listeners) l();
}

export const onboarding = {
  get: () => state,
  load(email: string) {
    if (state.email !== email) set({ email, seen: read(email) });
  },
  open(slide = 0) {
    set({ slide, hint: null, tips: null });
  },
  startTips(key: string) {
    set({ tips: { key, index: 0 }, hint: null, slide: null });
  },
  /** За последним шагом — конец, перед первым — остаёмся на первом. */
  stepTips(index: number, total: number) {
    if (!state.tips) return;
    set({ tips: index >= total ? null : { ...state.tips, index: Math.max(0, index) } });
  },
  endTips() {
    set({ tips: null });
  },
  close() {
    set({ slide: null });
  },
  showHint(id: HintId) {
    set({ hint: id });
  },
  /** Точка погасла: нажали «понятно» или открыли то, на что она указывала. */
  markSeen(id: HintId) {
    set({ hint: state.hint === id ? null : state.hint, seen: [...new Set([...state.seen, id])] });
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
};

export function useOnboarding(): OnboardingState {
  return useSyncExternalStore(onboarding.subscribe, onboarding.get, onboarding.get);
}
