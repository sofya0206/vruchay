import { useRef } from 'react';
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
 * Правки папок сбрасывают список папок, а список материалов — только
 * удаление: оно возвращает содержимое папки в корень, и без обновления
 * список показывал бы материалы в папке, которой уже нет. Переименование
 * и новая папка материалов не касаются, а их перезагрузка — это полсотни
 * миниатюр, перерисованных заново ради ничего.
 */
function useFolderMutation<TArgs>(
  fn: (args: TArgs) => Promise<unknown>,
  { touchesDocuments = false }: { touchesDocuments?: boolean } = {},
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['folders'] });
      if (touchesDocuments) void qc.invalidateQueries({ queryKey: ['documents'] });
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
  return useFolderMutation((id: string) => api.delete<Folder>(`/folders/${id}`), {
    touchesDocuments: true,
  });
}

/** Папки в порядке присланного списка, с позициями по номеру в нём. */
function arrange(folders: Folder[], ids: string[]): Folder[] {
  const by = new Map(folders.map((f) => [f.id, f]));
  const placed = ids
    .map((id, position) => {
      const f = by.get(id);
      return f ? { ...f, position } : null;
    })
    .filter((f): f is Folder => f !== null);
  // Папку могли завести в соседней вкладке — она встаёт в конец, а не
  // пропадает из колонки.
  return [...placed, ...folders.filter((f) => !ids.includes(f.id))];
}

/**
 * Новый порядок папок — весь список целиком, в том виде, в каком колонка
 * стоит после перетаскивания.
 *
 * Колонка переставляется сразу, в кэше запроса, а не через перезапрос:
 * раньше своя копия порядка сбрасывалась раньше, чем приходил ответ,
 * и папка на долю секунды прыгала на старое место и обратно.
 *
 * Запросы идут строго по очереди (`scope`): две быстрые перестановки
 * подряд иначе могли бы дойти до сервера в обратном порядке, и в базе
 * остался бы первый вариант. Ответ применяется, только если он на
 * последнюю перестановку — ответ на предыдущую откатил бы колонку
 * на шаг назад у человека на глазах. Отказ сервера возвращает правду
 * перезапросом.
 */
export function useReorderFolders() {
  const qc = useQueryClient();
  const latest = useRef<string[] | null>(null);
  const mutation = useMutation({
    mutationFn: (ids: string[]) => api.patch<Folder[]>('/folders/order', { ids }),
    scope: { id: 'folders-order' },
    onSuccess: (fresh, ids) => {
      if (latest.current === ids) qc.setQueryData(['folders'], fresh);
    },
    onError: (_error, ids) => {
      if (latest.current === ids) void qc.invalidateQueries({ queryKey: ['folders'] });
    },
  });

  return (ids: string[]) => {
    latest.current = ids;
    // Запрос списка, ушедший раньше (например, по возврату во вкладку),
    // вернулся бы со старым порядком поверх нового.
    void qc.cancelQueries({ queryKey: ['folders'] });
    qc.setQueryData<Folder[]>(['folders'], (prev) => (prev ? arrange(prev, ids) : prev));
    mutation.mutate(ids);
  };
}
