import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';

/** Папка библиотеки: название и сколько живых материалов внутри. */
export interface Folder {
  id: string;
  name: string;
  position: number;
  count: number;
}

export function useFolders() {
  return useQuery({
    queryKey: ['folders'],
    queryFn: () => api.get<Folder[]>('/folders'),
  });
}

/**
 * Правки папок сбрасывают и список материалов: удаление папки возвращает
 * то, что в ней лежало, в корень, и список без обновления показывал бы
 * материалы в папке, которой уже нет.
 */
function useFolderMutation<TArgs>(fn: (args: TArgs) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['folders'] });
      void qc.invalidateQueries({ queryKey: ['documents'] });
    },
  });
}

export function useCreateFolder() {
  return useFolderMutation((name: string) => api.post<Folder>('/folders', { name }));
}

export function useRenameFolder() {
  return useFolderMutation((v: { id: string; name: string }) =>
    api.patch<Folder>(`/folders/${v.id}`, { name: v.name }),
  );
}

export function useDeleteFolder() {
  return useFolderMutation((id: string) => api.delete<Folder>(`/folders/${id}`));
}

/**
 * Новый порядок папок — весь список целиком, в том виде, в каком колонка
 * стоит после перетаскивания. Сервер расставляет позиции по номерам в нём.
 */
export function useReorderFolders() {
  return useFolderMutation((ids: string[]) => api.patch<Folder[]>('/folders/order', { ids }));
}
