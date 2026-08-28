import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';

/** Состояние выданного документа: действителен, отозван или заменён. */
export type FileState = 'valid' | 'revoked' | 'replaced';

export interface RegistryRow {
  fileId: string;
  publicId: string;
  name: string;
  email: string;
  documentId: string | null;
  documentTitle: string;
  eventName: string;
  eventDate: string;
  issuedAt: string;
  state: FileState;
  /** Перевыпуск заказан, но нового документа ещё нет. */
  reissuePending: boolean;
  replacedBy: { fileId: string; publicId: string; issuedAt: string } | null;
  mail: { status: string; sentAt: string | null; error: string | null } | null;
  verifyCount: number;
  verifyLastAt: string | null;
  downloadCount: number;
  retention: { trashedAt: string; purgeAt: string; daysLeft: number } | null;
}

export interface RegistryPage {
  items: RegistryRow[];
  total: number;
  limit: number;
  offset: number;
}

export interface RegistryFacets {
  documents: {
    id: string;
    title: string;
    eventName: string;
    eventDate: string;
    deletedAt: string | null;
  }[];
  events: string[];
  trashDays: number;
}

export interface RegistryAnalytics {
  issued: number;
  revoked: number;
  replaced: number;
  mail: {
    queued: number;
    sent: number;
    delivered: number;
    opened: number;
    bounced: number;
    failed: number;
  };
  downloads: { total: number; files: number };
  verifications: { total: number; files: number };
  documents: {
    documentId: string | null;
    title: string;
    eventName: string;
    issued: number;
    verifications: number;
  }[];
}

export interface HistoryEntry {
  at: string;
  kind: 'issued' | 'mail' | 'action';
  title: string;
  detail: string;
  actor: string;
}

export interface RegistryDetail {
  row: RegistryRow;
  verifyCount: number;
  verifyLastAt: string | null;
  emails: {
    id: string;
    toEmail: string;
    status: string;
    error: string | null;
    queuedAt: string;
  }[];
  history: HistoryEntry[];
}

/** Кого действие не коснулось и почему. */
export interface SkippedItem {
  fileId: string;
  name: string;
  reason: string;
}

export interface RegistryFilters {
  search: string;
  documentId: string;
  event: string;
  state: '' | FileState;
  mail: string;
  from: string;
  to: string;
}

export const emptyFilters: RegistryFilters = {
  search: '',
  documentId: '',
  event: '',
  state: '',
  mail: '',
  from: '',
  to: '',
};

/**
 * Строка запроса из отбора.
 *
 * Пустые значения выбрасываем: `?event=` на сервере означало бы отбор
 * по пустому названию мероприятия, а человек имел в виду «всё равно».
 */
export function filtersToQuery(filters: RegistryFilters): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  return params.toString();
}

export function useRegistry(filters: RegistryFilters, offset: number, limit = 50) {
  const query = filtersToQuery(filters);
  return useQuery({
    queryKey: ['registry', query, offset, limit],
    queryFn: () =>
      api.get<RegistryPage>(`/registry?limit=${limit}&offset=${offset}${query ? `&${query}` : ''}`),
    // Выданное не меняется само по себе: список за прошлый месяц одинаков
    // и сейчас, и через минуту.
    staleTime: 30_000,
  });
}

export function useRegistryFacets() {
  return useQuery({
    queryKey: ['registry-facets'],
    queryFn: () => api.get<RegistryFacets>('/registry/facets'),
    staleTime: 5 * 60_000,
  });
}

export function useRegistryAnalytics(filters: RegistryFilters, enabled: boolean) {
  const query = filtersToQuery(filters);
  return useQuery({
    queryKey: ['registry-analytics', query],
    queryFn: () => api.get<RegistryAnalytics>(`/registry/analytics${query ? `?${query}` : ''}`),
    enabled,
    staleTime: 60_000,
  });
}

export function useRegistryDetail(fileId: string | null) {
  return useQuery({
    queryKey: ['registry-detail', fileId],
    queryFn: () => api.get<RegistryDetail>(`/registry/files/${fileId}`),
    enabled: fileId !== null,
  });
}

/**
 * Массовые действия.
 *
 * После любого из них обновляем и таблицу, и сводку: перевыпуск меняет
 * состояние документа, переотправка — состояние письма, и показывать
 * прежние цифры рядом с новым списком нельзя.
 */
export function useRegistryAction<TResult>(path: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => api.post<TResult>(`/registry/${path}`, body),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['registry'] }),
        qc.invalidateQueries({ queryKey: ['registry-analytics'] }),
        qc.invalidateQueries({ queryKey: ['registry-detail'] }),
      ]);
    },
  });
}
