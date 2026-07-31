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
  columns: { source: string; suggested: string }[];
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
