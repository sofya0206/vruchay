import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';

export type TokenRole = 'member' | 'admin';

export interface ApiTokenInfo {
  id: string;
  name: string;
  /** Начало токена — по нему владелец узнаёт свой среди нескольких. */
  prefix: string;
  role: TokenRole;
  createdAt: string;
  lastUsedAt: string | null;
}

export function useTokens() {
  return useQuery({
    queryKey: ['tokens'],
    queryFn: () => api.get<ApiTokenInfo[]>('/tokens'),
    retry: false,
  });
}

export function useTokenMutations() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ['tokens'] });

  return {
    create: useMutation({
      mutationFn: (v: { name: string; role: TokenRole }) =>
        api.post<{ id: string; name: string; token: string }>('/tokens', v),
      onSuccess: refresh,
    }),
    revoke: useMutation({
      mutationFn: (id: string) => api.delete<{ ok: true }>(`/tokens/${id}`),
      onSuccess: refresh,
    }),
  };
}
