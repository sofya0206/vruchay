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

/** Как показывать получателя на странице проверки. */
export type VerifyNameMode = 'full' | 'initials' | 'none';

/** Публичное лицо организации: страница снаружи и настройки страницы проверки. */
export interface PublicProfile {
  name: string;
  slug: string | null;
  description: string;
  inn: string;
  website: string;
  contactEmail: string;
  contactPhone: string;
  logoFileId: string | null;
  logoUrl: string | null;
  /** Ставит владелец сервиса после проверки; самой организации не правится. */
  verifiedIssuer: boolean;
  verifiedAt: string | null;
  publicPageEnabled: boolean;
  publicSearchByName: boolean;
  publicIndexable: boolean;
  verifyNameMode: VerifyNameMode;
}

export type PublicProfilePatch = Partial<
  Omit<PublicProfile, 'name' | 'logoFileId' | 'logoUrl' | 'verifiedIssuer' | 'verifiedAt'>
> & { consentConfirmed?: boolean };

export function useOrgProfile() {
  return useQuery({ queryKey: ['org'], queryFn: () => api.get<OrgProfile>('/org') });
}

export function useUsage() {
  return useQuery({ queryKey: ['usage'], queryFn: () => api.get<Usage>('/org/usage') });
}

export function usePublicProfile() {
  return useQuery({
    queryKey: ['org-public-profile'],
    queryFn: () => api.get<PublicProfile>('/org/public-profile'),
  });
}

export function useUpdatePublicProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: PublicProfilePatch) =>
      api.patch<PublicProfile>('/org/public-profile', patch),
    onSuccess: (profile) => qc.setQueryData(['org-public-profile'], profile),
  });
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
