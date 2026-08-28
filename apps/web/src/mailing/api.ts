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

export function useMailingLog(filters: { documentId?: string; problemsOnly: boolean }) {
  const params = new URLSearchParams();
  if (filters.documentId) params.set('documentId', filters.documentId);
  if (filters.problemsOnly) params.set('problemsOnly', 'true');
  const query = params.toString();

  return useQuery({
    queryKey: ['mailing-log', filters.documentId ?? '', filters.problemsOnly],
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
