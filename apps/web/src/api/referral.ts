import { useQuery } from '@tanstack/react-query';
import { api } from './client';

export interface ReferralInvited {
  name: string;
  joinedAt: string;
  /** Друг уже выпустил столько документов, что бонус начислен. */
  working: boolean;
}

export interface ReferralSummary {
  code: string;
  link: string;
  /** Готовый текст для пересылки в мессенджере. */
  message: string;
  invitedTotal: number;
  invitedWorking: number;
  bonusEarned: number;
  welcomeBonus: number;
  rewardPerFriend: number;
  qualifyDocuments: number;
  maxRewarded: number;
  invited: ReferralInvited[];
}

export function useReferral() {
  return useQuery({
    queryKey: ['referral'],
    queryFn: () => api.get<ReferralSummary>('/referral'),
  });
}

/** Что обещано пришедшему по коду. Валидный или нет — решает сервер. */
export type ReferralOffer =
  | { valid: false; freeLimit: number }
  | { valid: true; invitedBy: string; freeLimit: number; welcomeBonus: number; total: number };

export function useReferralOffer(code: string | undefined) {
  return useQuery({
    queryKey: ['referral-offer', code],
    // Числа берём с сервера, а не пишем в вёрстке: обещание «сто документов
    // вместо пятидесяти» должно меняться в одном месте вместе с настройкой.
    queryFn: () => api.get<ReferralOffer>(`/referral-offer?ref=${encodeURIComponent(code!)}`),
    enabled: Boolean(code),
    retry: false,
  });
}
