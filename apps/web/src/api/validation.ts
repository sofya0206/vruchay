import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { BatchValidation } from '@gramota/shared';
import { api } from './client';

/**
 * Проверка списка получателей до выпуска.
 *
 * Не useQuery, а мутация: разбор десяти тысяч строк — работа, которую
 * человек запускает сам и осознанно, а не то, что должно случаться при
 * каждом заходе на вкладку и повторяться при возврате фокуса в окно.
 */
export function useValidation(documentId: string) {
  return useMutation({
    mutationFn: (scope: 'checked' | 'all' = 'checked') =>
      api.post<BatchValidation>(`/documents/${documentId}/validation`, { scope }),
  });
}

export interface CellFix {
  rowId: string;
  column: string;
  value: string;
}

export function useValidationFixes(documentId: string) {
  const qc = useQueryClient();
  // Правки меняют саму таблицу получателей — её показ устарел.
  const refresh = () => qc.invalidateQueries({ queryKey: ['recipients', documentId] });
  const base = `/documents/${documentId}/validation`;

  return {
    fix: useMutation({
      mutationFn: (fixes: CellFix[]) => api.post<{ updated: number }>(`${base}/fix`, { fixes }),
      onSuccess: refresh,
    }),
    exclude: useMutation({
      mutationFn: (rowIds: string[]) =>
        api.post<{ excluded: number }>(`${base}/exclude`, { rowIds }),
      onSuccess: refresh,
    }),
  };
}
