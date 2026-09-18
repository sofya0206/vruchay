import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';

/**
 * Клиент раздела рассылки.
 *
 * Поток письма (выдача документа или реклама) ходит в каждом запросе
 * отдельным полем: и шаблон, и проверка, и отправка выбираются по нему.
 * Это не удобство интерфейса, а требование закона — см. серверный
 * mailing/letter-kind.ts.
 */

export type LetterKind = 'transactional' | 'marketing';

export type RecipientSource = 'table' | 'manual';

export interface MailingTemplate {
  id: string;
  kind: LetterKind;
  subject: string;
  bodyHtml: string;
  attachGeneratedFile: boolean;
  advertiserName: string | null;
  senderId: string | null;
}

export interface SkippedRecipient {
  name: string;
  email: string;
  reason: string;
}

export interface Audience {
  documentId: string;
  title: string;
  /** Почему отправка невозможна вовсе: нет письма, домен не подтверждён. */
  refusal: string | null;
  willSend: number;
  letters: { email: string; name: string }[];
  skipped: SkippedRecipient[];
}

export interface SendResult {
  queued: number;
  results: { documentId: string; title: string; queued: number; skipped: SkippedRecipient[] }[];
}

export interface DeliveryProblem {
  reason: string;
  retryable: boolean;
  details: string | null;
}

export interface LogItem {
  id: string;
  documentId: string | null;
  documentTitle: string;
  toEmail: string;
  subject: string;
  status: 'queued' | 'sent' | 'delivered' | 'opened' | 'bounced' | 'failed';
  kind: LetterKind;
  queuedAt: string;
  sentAt: string | null;
  problem: DeliveryProblem | null;
}

export interface MailingLog {
  items: LogItem[];
  summary: Partial<Record<LogItem['status'], number>>;
}

export interface SendRequest {
  documentIds: string[];
  kind: LetterKind;
  source: RecipientSource;
  emails?: string;
}

export function useMailingTemplate(documentId: string | null, kind: LetterKind) {
  return useQuery({
    queryKey: ['mailing-template', documentId, kind],
    queryFn: () => api.get<MailingTemplate | null>(`/mailing/templates/${documentId}?kind=${kind}`),
    enabled: Boolean(documentId),
  });
}

export function useSaveTemplate(documentId: string, kind: LetterKind) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      subject: string;
      bodyHtml: string;
      attachGeneratedFile: boolean;
      advertiserName?: string;
    }) => api.post<MailingTemplate>(`/mailing/templates/${documentId}`, { kind, ...body }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['mailing-template', documentId, kind] });
      // Проверка считалась по прежнему письму — она устарела.
      void qc.invalidateQueries({ queryKey: ['mailing-audience'] });
    },
  });
}

/** Кому уйдёт и кому не уйдёт. Считает сервер тем же кодом, что и отправка. */
export function useAudience() {
  return useMutation({
    mutationFn: (body: {
      documentId: string;
      kind: LetterKind;
      source: RecipientSource;
      emails?: string;
    }) => api.post<Audience>('/mailing/audience', body),
  });
}

export function useSendMailing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SendRequest) => api.post<SendResult>('/mailing/send', body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['mailing-log'] });
      void qc.invalidateQueries({ queryKey: ['registry'] });
    },
  });
}

/** Письмо себе: адрес берёт сервер из сессии, отправить чужому нельзя. */
export function useTestSend() {
  return useMutation({
    mutationFn: (body: { documentId: string; kind: LetterKind }) =>
      api.post<{ to: string; title: string }>('/mailing/test', body),
  });
}

export function useMailingLog(filters: {
  documentId?: string;
  problemsOnly: boolean;
  search?: string;
}) {
  const params = new URLSearchParams();
  if (filters.documentId) params.set('documentId', filters.documentId);
  if (filters.problemsOnly) params.set('problemsOnly', 'true');
  if (filters.search) params.set('search', filters.search);
  const query = params.toString();

  return useQuery({
    queryKey: ['mailing-log', filters.documentId ?? '', filters.problemsOnly, filters.search ?? ''],
    // Пока идёт поиск, на экране остаются прежние письма, а не пустота.
    placeholderData: (previous) => previous,
    queryFn: () => api.get<MailingLog>(`/mailing/log${query ? `?${query}` : ''}`),
    // Письма уходят очередью: журнал, открытый сразу после отправки,
    // показывал бы «в очереди» до перезагрузки страницы.
    refetchInterval: 5000,
  });
}

export function useResendFailed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (documentId: string) =>
      api.post<{ title: string; queued: number; skipped: SkippedRecipient[] }>('/mailing/resend', {
        documentId,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mailing-log'] }),
  });
}

// ─── Сводка по письмам ──────────────────────────────────────────────────────

/** Воронка письма нарастающим итогом: прочитанное входит и в доставленные. */
export interface Funnel {
  total: number;
  sent: number;
  delivered: number;
  opened: number;
  failed: number;
  queued: number;
}

export interface StatsDay extends Funnel {
  /** «2026-09-15» по Москве. */
  day: string;
}

export interface StatsSource extends Funnel {
  id: string;
  type: 'document' | 'mailing';
  title: string;
  eventName: string;
}

export interface MailStats {
  from: string;
  to: string;
  totals: Funnel;
  days: StatsDay[];
  sources: StatsSource[];
}

export function useMailStats(period: { from: string; to: string }) {
  return useQuery({
    queryKey: ['mailing-stats', period.from, period.to],
    queryFn: () => api.get<MailStats>(`/mailing/stats?from=${period.from}&to=${period.to}`),
    // Письма доходят и открываются после отправки — сводка живёт.
    refetchInterval: 30_000,
  });
}

// ─── Рассылка без документа ─────────────────────────────────────────────────

export interface TextMailing {
  id: string;
  name: string;
  kind: LetterKind;
  subject: string;
  bodyHtml: string;
  advertiserName: string | null;
  senderId: string | null;
  /** Письма уже ушли — текст заморожен. */
  locked?: boolean;
}

export interface TextMailingDraft {
  name: string;
  kind: LetterKind;
  subject: string;
  bodyHtml: string;
  advertiserName?: string;
}

export interface TextAudience {
  refusal: string | null;
  willSend: number;
  skipped: SkippedRecipient[];
}

export interface TextSendResult {
  name: string;
  queued: number;
  skipped: SkippedRecipient[];
}

export function useTextMailing(id: string | null) {
  return useQuery({
    queryKey: ['text-mailing', id],
    queryFn: () => api.get<TextMailing>(`/mailing/text/${id}`),
    enabled: Boolean(id),
  });
}

/** Сохранить черновик: без id — создать, с id — переписать. */
export function useSaveTextMailing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, draft }: { id: string | null; draft: TextMailingDraft }) =>
      id
        ? api.patch<TextMailing>(`/mailing/text/${id}`, draft)
        : api.post<TextMailing>('/mailing/text', draft),
    onSuccess: (saved) => qc.setQueryData(['text-mailing', saved.id], saved),
  });
}

export function useTextAudience() {
  return useMutation({
    mutationFn: ({ id, emails }: { id: string; emails: string }) =>
      api.post<TextAudience>(`/mailing/text/${id}/audience`, { emails }),
  });
}

export function useTextTest() {
  return useMutation({
    mutationFn: (id: string) => api.post<{ to: string }>(`/mailing/text/${id}/test`, {}),
  });
}

export function useTextSend() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, emails }: { id: string; emails: string }) =>
      api.post<TextSendResult>(`/mailing/text/${id}/send`, { emails }),
    onSuccess: (_, { id }) => {
      void qc.invalidateQueries({ queryKey: ['mailing-log'] });
      void qc.invalidateQueries({ queryKey: ['mailing-stats'] });
      void qc.invalidateQueries({ queryKey: ['text-mailing', id] });
    },
  });
}
