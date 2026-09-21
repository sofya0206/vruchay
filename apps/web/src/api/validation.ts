import { skipToken, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BatchValidation } from '@gramota/shared';
import { api } from './client';

/**
 * Проверка списка получателей до выпуска.
 *
 * Не useQuery, а мутация: разбор десяти тысяч строк — работа, которую
 * человек запускает сам и осознанно, а не то, что должно случаться при
 * каждом заходе на вкладку и повторяться при возврате фокуса в окно.
 *
 * Результат заодно кладём в кэш по ключу `validation-report`: сервер
 * саму проверку нигде не хранит (эндпоинт нарочно POST, а не GET — отчёт
 * с именами и почтами не должен оседать в кэше HTTP), а шагу «Выпуск»
 * нужно honest-ли показать, прогоняли ли проверку в этом заходе. Тот же
 * приём, что и у `useGeneration` в recipients.ts — мутация пишет,
 * отдельный компонент читает через свой `useQuery`.
 */
export function useValidation(documentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (scope: 'checked' | 'all' = 'checked') =>
      api.post<BatchValidation>(`/documents/${documentId}/validation`, { scope }),
    onSuccess: (report) => qc.setQueryData(['validation-report', documentId], report),
  });
}

/**
 * Последний прогон проверки, который видел ValidationScreen в этом заходе —
 * сама ничего не запрашивает, только наблюдает то, что положила мутация
 * выше. `undefined` — проверку ни разу не запускали.
 */
export function useLastValidation(documentId: string): BatchValidation | undefined {
  return useQuery<BatchValidation>({
    queryKey: ['validation-report', documentId],
    queryFn: skipToken,
    staleTime: Infinity,
  }).data;
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
