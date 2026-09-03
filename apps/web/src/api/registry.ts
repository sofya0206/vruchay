import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';

/** Состояние выданного документа: действителен, отозван, заменён или срок истёк. */
export type FileState = 'valid' | 'revoked' | 'replaced' | 'expired';

export interface RegistryRow {
  fileId: string;
  publicId: string;
  /** Код, напечатанный на бумаге: короткий у новых выпусков, UUID у старых. */
  code: string;
  /** Путь страницы проверки — тот же, что в QR на документе. */
  verifyPath: string;
  name: string;
  email: string;
  documentId: string | null;
  documentTitle: string;
  eventName: string;
  eventDate: string;
  issuedAt: string;
  /** Когда документ перестаёт действовать. null — бессрочный. */
  expiresAt: string | null;
  /** Имя на бумаге, если строку таблицы после выпуска поправили. */
  printedName: string | null;
  revokedAt: string | null;
  revokedReasonPublic: string | null;
  /** Только владельцу и управляющему; остальным null. */
  revokedReasonInternal: string | null;
  /** Когда PDF подписан электронной подписью сервиса. null — без подписи. */
  signedAt: string | null;
  state: FileState;
  /** Перевыпуск заказан, но нового документа ещё нет. */
  reissuePending: boolean;
  replacedBy: {
    fileId: string;
    publicId: string;
    code: string;
    verifyPath: string;
    issuedAt: string;
  } | null;
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
  expired: number;
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

/** Кого отзывать: отмеченные документы либо всё найденное по отбору. */
export type RevokeTarget =
  | { fileIds: string[]; filter?: undefined }
  | { fileIds?: undefined; filter: Record<string, string> };

/** Что будет отозвано — до необратимого действия. */
export interface RevokePreview {
  count: number;
  alreadyRevoked: number;
  sample: { fileId: string; name: string; code: string; documentTitle: string; state: FileState }[];
}

/**
 * Можно ли отзывать «всё найденное» по этому отбору.
 *
 * Только суженный отбор: материал, мероприятие или период. Пустой отбор —
 * это всё выданное организацией за всё время, и один клик мимо гасил бы
 * всю историю. Сервер проверяет то же самое ещё раз.
 */
export function revokableByFilter(filters: RegistryFilters): boolean {
  return Boolean(filters.documentId || filters.event || filters.from || filters.to);
}

/** Отбор для сервера: только заполненные поля. */
export function filterForRevoke(filters: RegistryFilters): Record<string, string> {
  return Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
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

/** Состояния, которые отбор вообще знает. */
const STATES: FileState[] = ['valid', 'revoked', 'replaced', 'expired'];

/**
 * Отбор из строки адреса.
 *
 * Нужен, чтобы «посмотреть выданное по этому материалу» было ссылкой:
 * реестр открывается сразу суженным, а не всем подряд, из которого
 * человек ещё должен выбрать материал в списке из сорока.
 *
 * Разбираем по белому списку — только известные поля и только известные
 * состояния. Чужая ссылка не должна класть в отбор произвольное поле,
 * которое потом уедет на сервер строкой запроса.
 */
export function filtersFromQuery(search: string): RegistryFilters {
  const params = new URLSearchParams(search);
  const filters = { ...emptyFilters };

  for (const key of Object.keys(emptyFilters) as (keyof RegistryFilters)[]) {
    const value = params.get(key);
    if (!value) continue;
    if (key === 'state') {
      if (STATES.includes(value as FileState)) filters.state = value as FileState;
      continue;
    }
    filters[key] = value;
  }

  return filters;
}

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
