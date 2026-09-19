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

/* ---------- Сводка за период ---------- */

export const PERIODS = ['7d', '30d', '90d', '365d', 'all'] as const;
export type Period = (typeof PERIODS)[number];

export interface DayPoint {
  /** «2026-09-20» по Москве */
  day: string;
  n: number;
}

export interface SummaryMaterial {
  documentId: string | null;
  title: string;
  eventName: string;
  issued: number;
  checks: number;
  checkedFiles: number;
  sent: number;
  delivered: number;
}

export interface Summary {
  period: Period;
  range: { from: string | null; to: string; prevFrom: string | null; prevTo: string | null };
  issued: { total: number; prev: number | null; byDay: DayPoint[] };
  checks: {
    total: number;
    prev: number | null;
    uniques: number;
    files: number;
    lastAt: string | null;
    byDay: DayPoint[];
  };
  mail: { sent: number; delivered: number; undelivered: number };
  states: { valid: number; revoked: number; replaced: number; expired: number };
  materials: SummaryMaterial[];
  materialsTotal: number;
}

export function isPeriod(value: string | null): value is Period {
  return (PERIODS as readonly string[]).includes(value ?? '');
}

/**
 * Сводка за период: плитки, графики по дням, разбивка по материалам.
 * Один запрос на экран; прошлые данные держим на экране, пока грузятся
 * новые, чтобы переключение периода не мигало скелетом.
 */
export function useAnalyticsSummary(period: Period, documentId = '') {
  const q = new URLSearchParams({ period });
  if (documentId) q.set('documentId', documentId);
  return useQuery({
    queryKey: ['analytics-summary', period, documentId],
    queryFn: () => api.get<Summary>(`/analytics/summary?${q}`),
    placeholderData: (prev) => prev,
    staleTime: 60_000,
  });
}
