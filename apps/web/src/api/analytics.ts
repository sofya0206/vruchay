import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from './client';

/** Шаг воронки активации: путь от регистрации до второго мероприятия. */
export interface ActivationStep {
  key: string;
  label: string;
  done: boolean;
}

export interface MonthNumbers {
  title: string;
  issued: number;
  mailed: number;
  /** Сколько выданных документов проверяли по QR в этом месяце. */
  verifiedFiles: number;
}

export interface OrgAnalytics {
  registeredAt: string;
  activation: { steps: ActivationStep[] };
  timeToFirst: {
    firstIssuedAt: string | null;
    /** null — организация ещё ничего не выпускала. */
    minutes: number | null;
    targetMinutes: number;
  };
  issued: number;
  mailed: number;
  verifications: { total: number; files: number };
  packages: {
    started: number;
    finished: number;
    clean: number;
    /** null — законченных пакетов ещё нет, и доле не от чего считаться. */
    cleanShare: number | null;
  };
  reissues: { count: number; share: number | null };
  thisMonth: MonthNumbers;
  lastMonth: MonthNumbers;
}

export interface FunnelStepRow {
  key: string;
  label: string;
  organizations: number;
  share: number | null;
}

export interface PlatformFunnel {
  at: string;
  organizations: number;
  steps: FunnelStepRow[];
  timeToFirst: {
    targetMinutes: number;
    organizations: number;
    medianMinutes: number | null;
    inTarget: number;
    inTargetShare: number | null;
  };
  packages: { finished: number; clean: number; cleanShare: number | null };
  reissues: { issued: number; count: number; share: number | null };
  verifications: { total: number };
  notes: { checked: string };
}

export function useOrgAnalytics() {
  return useQuery({
    queryKey: ['analytics'],
    queryFn: () => api.get<OrgAnalytics>('/analytics'),
    // Цифры за месяц не меняются от минуты к минуте, а раздел открывают
    // и закрывают по нескольку раз, сверяясь с реестром рядом.
    staleTime: 60_000,
  });
}

/**
 * Воронка по всем организациям. Запрашивается только владельцем сервиса:
 * клиенту она вернёт отказ, и звать его туда незачем.
 */
export function usePlatformFunnel(enabled: boolean) {
  return useQuery({
    queryKey: ['analytics-funnel'],
    queryFn: () => api.get<PlatformFunnel>('/analytics/funnel'),
    enabled,
    staleTime: 5 * 60_000,
  });
}

/** Прислать себе месячную сводку — ту, что первого числа уходит владельцу. */
export function useDigestPreview() {
  return useMutation({
    mutationFn: () => api.post<{ ok: true } & MonthNumbers>('/analytics/digest/preview', {}),
  });
}
