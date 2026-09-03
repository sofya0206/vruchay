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
  /** Свой домен страницы проверки; пусто — общий домен сервиса. */
  verifyDomain: string;
}

export type PublicProfilePatch = Partial<
  Omit<
    PublicProfile,
    'name' | 'logoFileId' | 'logoUrl' | 'verifiedIssuer' | 'verifiedAt' | 'verifyDomain'
  >
> & { consentConfirmed?: boolean };

/** Кто платит: от вида зависит, какие реквизиты вообще бывают. */
export type BillingKind = 'legal' | 'ie' | 'self_employed' | 'individual';

export interface Billing {
  kind: BillingKind | null;
  name: string;
  inn: string;
  kpp: string;
  ogrn: string;
  address: string;
  email: string;
  /**
   * Чем заполнить пустую форму: реквизиты из последнего счёта, а если
   * счетов не было — то, что известно об организации.
   */
  suggested: {
    from: 'invoice' | 'org';
    name: string;
    inn: string;
    email: string;
    at: string | null;
  };
}

export type BillingPatch = Omit<Billing, 'suggested' | 'kind'> & { kind: BillingKind };

export type UiTheme = 'system' | 'light' | 'dark';
export type DateFormat = 'numeric' | 'long' | 'iso';

export interface Preferences {
  theme: UiTheme;
  dateFormat: DateFormat;
}

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

export function useBilling() {
  return useQuery({ queryKey: ['org-billing'], queryFn: () => api.get<Billing>('/org/billing') });
}

export function useUpdateBilling() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: BillingPatch) => api.patch<{ ok: true }>('/org/billing', patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['org-billing'] }),
  });
}

export function useSetVerifyDomain() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (domain: string) => api.patch<{ ok: true }>('/org/verify-domain', { domain }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['org-public-profile'] }),
  });
}

export function usePreferences() {
  return useQuery({
    queryKey: ['preferences'],
    queryFn: () => api.get<Preferences>('/org/preferences'),
  });
}

export function useUpdatePreferences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<Preferences>) =>
      api.patch<Preferences>('/org/preferences', patch),
    onSuccess: (prefs) => qc.setQueryData(['preferences'], prefs),
  });
}
