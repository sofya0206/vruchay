import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';

export interface OrgProfile {
  orgName: string;
  plan: 'free' | 'paid';
  userName: string;
  email: string;
}

export interface Usage {
  plan: 'free' | 'paid';
  used: number;
  /** На оплаченном тарифе предела нет — тогда null. */
  limit: number | null;
  left: number | null;
  /** Сколько добавили приглашения друзей. */
  bonus: number;
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
