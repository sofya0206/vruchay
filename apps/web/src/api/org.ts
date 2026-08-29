import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';

export interface OrgProfile {
  orgName: string;
  plan: 'free' | 'paid';
  userName: string;
  email: string;
}

/**
 * Насколько близко к концу квоты.
 *
 * Предупреждаем на двадцати и на десяти процентах остатка: узнать о конце
 * квоты в день награждения — значит узнать поздно.
 */
export type UsageWarn = 'none' | 'low' | 'critical' | 'exhausted' | 'expired';

export interface Usage {
  plan: 'free' | 'paid';
  /** Как называются условия: «Бесплатная проба» или название плана. */
  planName: string;
  /** Откуда условия взялись: проба, назначенный план или старый тариф. */
  source: 'trial' | 'plan' | 'legacy-paid';
  used: number;
  /** Без ограничения — null. */
  limit: number | null;
  left: number | null;
  /** Сколько добавили приглашения друзей. Только на пробе. */
  bonus: number;
  warn: UsageWarn;
  /** Когда план кончается. null — срок не ограничен. */
  endsAt: string | null;
  /** Срок вышел: новый выпуск не начнётся, выданное остаётся действительным. */
  expired: boolean;
  /** Пакет не сгорает: остаток доступен и после даты окончания. */
  neverExpires: boolean;
  /** Что входит в план. null — ограничений по возможностям нет. */
  features: string[] | null;
}

export function useOrgProfile() {
  return useQuery({ queryKey: ['org'], queryFn: () => api.get<OrgProfile>('/org') });
}

export function useUsage() {
  return useQuery({ queryKey: ['usage'], queryFn: () => api.get<Usage>('/org/usage') });
}

export function useOrgMutations() {
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['org'] });
    // Имя пользователя стоит в шапке — её данные тоже надо обновить.
    void qc.invalidateQueries({ queryKey: ['me'] });
  };

  return {
    renameOrg: useMutation({
      mutationFn: (name: string) => api.patch<{ ok: true }>('/org', { name }),
      onSuccess: refresh,
    }),
    renameMe: useMutation({
      mutationFn: (name: string) => api.patch<{ ok: true }>('/org/me', { name }),
      onSuccess: refresh,
    }),
  };
}
