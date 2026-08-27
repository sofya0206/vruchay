import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';

export interface RecipientColumn {
  id: string;
  name: string;
  position: number;
}

export interface RecipientRow {
  id: string;
  position: number;
  data: Record<string, string>;
  checked: boolean;
  lastFileId: string | null;
}

export interface RecipientTable {
  columns: RecipientColumn[];
  rows: RecipientRow[];
  checkedCount: number;
}

export interface ParsedSheet {
  sheetName: string;
  headerRowIndex: number;
  /** `guessed` — имя подобрано по значениям колонки, а не по её заголовку. */
  columns: { source: string; suggested: string; guessed?: boolean }[];
  rows: string[][];
  skippedEmptyRows: number;
  warnings: string[];
}

export interface GenerationJob {
  id: string;
  status: 'queued' | 'running' | 'done' | 'failed' | 'canceled';
  total: number;
  done: number;
  failed: number;
  error: string | null;
}

export function useRecipients(documentId: string) {
  return useQuery({
    queryKey: ['recipients', documentId],
    queryFn: () => api.get<RecipientTable>(`/documents/${documentId}/recipients`),
  });
}

export function useRecipientMutations(documentId: string) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ['recipients', documentId] });
  const base = `/documents/${documentId}/recipients`;

  return {
    updateRow: useMutation({
      mutationFn: (v: { rowId: string; data?: Record<string, string>; checked?: boolean }) =>
        api.patch(`${base}/rows/${v.rowId}`, { data: v.data, checked: v.checked }),
      onSuccess: refresh,
    }),
    addRow: useMutation({
      mutationFn: () => api.post(`${base}/rows`, { data: {} }),
      onSuccess: refresh,
    }),
    deleteRow: useMutation({
      mutationFn: (rowId: string) => api.delete(`${base}/rows/${rowId}`),
      onSuccess: refresh,
    }),
    addColumn: useMutation({
      mutationFn: (name: string) => api.post(`${base}/columns`, { name }),
      onSuccess: refresh,
    }),
    deleteColumn: useMutation({
      mutationFn: (columnId: string) => api.delete(`${base}/columns/${columnId}`),
      onSuccess: refresh,
    }),
    setChecked: useMutation({
      mutationFn: (v: { checked: boolean; rowIds?: string[] }) => api.post(`${base}/checked`, v),
      onSuccess: refresh,
    }),
    parseFile: useMutation({
      mutationFn: (file: File) => api.upload<ParsedSheet>(`${base}/parse`, file),
    }),
    importRows: useMutation({
      mutationFn: (v: { columns: string[]; rows: string[][]; mode: 'append' | 'replace' }) =>
        api.post<{ imported: number }>(`${base}/import`, v),
      onSuccess: refresh,
    }),
  };
}

export function useGeneration(documentId: string, jobId: string | null) {
  const qc = useQueryClient();

  const job = useQuery({
    queryKey: ['job', jobId],
    queryFn: () => api.get<GenerationJob>(`/jobs/${jobId}`),
    enabled: Boolean(jobId),
    // Пока задание идёт — опрашиваем; как завершилось, останавливаемся.
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'queued' || status === 'running' ? 1500 : false;
    },
    // Генерация сотни сертификатов идёт минуты, и пользователь за это время
    // почти наверняка уйдёт в другую вкладку. Без этого флага опрос замирает
    // при потере фокуса, и вернувшийся человек видит навсегда застывший прогресс.
    refetchIntervalInBackground: true,
    // По той же причине данные задания не должны считаться свежими:
    // глобальный staleTime здесь только мешает.
    staleTime: 0,
  });

  const start = useMutation({
    mutationFn: () => api.post<GenerationJob>(`/documents/${documentId}/generate`, { format: 'pdf' }),
    onSuccess: (created) => {
      qc.setQueryData(['job', created.id], created);
      void qc.invalidateQueries({ queryKey: ['recipients', documentId] });
    },
  });

  return { job: job.data, start };
}

/** Кого рассылка пропустила и почему — показываем поимённо, а не числом. */
export interface SendResult {
  queued: number;
  skipped: { name: string; reason: string }[];
}

/**
 * Рассылка созданных документов участникам.
 *
 * Отдельное действие, а не продолжение выпуска: файлы часто делают заранее,
 * а рассылают в день награждения. Маршрут на сервере был с самого начала,
 * но вызвать его из кабинета было нечем — письма не уходили никому.
 */
export function useSend(documentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<SendResult>(`/mail/send/${documentId}`, {}),
    onSuccess: () => {
      // Реестр показывает состояние писем — после рассылки он устарел.
      void qc.invalidateQueries({ queryKey: ['registry', documentId] });
    },
  });
}

/**
 * Настроено ли письмо. Нужно до выпуска, а не после: узнать, что рассылать
 * нечем, когда файлы уже созданы, — значит проделать половину работы впустую.
 */
export function useMailTemplate(documentId: string) {
  return useQuery({
    queryKey: ['email-template', documentId],
    queryFn: () =>
      api.get<{ subject: string; bodyHtml: string; attachGeneratedFile: boolean } | null>(
        `/mail/templates/${documentId}`,
      ),
  });
}
