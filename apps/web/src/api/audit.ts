import { useQuery } from '@tanstack/react-query';
import { api } from './client';

export interface AuditEvent {
  id: string;
  action: string;
  summary: string;
  actorName: string;
  actorEmail: string;
  targetType: string | null;
  targetId: string | null;
  createdAt: string;
}

export interface AuditPage {
  total: number;
  limit: number;
  offset: number;
  items: AuditEvent[];
}

export function useAudit(offset: number, limit = 50) {
  return useQuery({
    queryKey: ['audit', offset, limit],
    queryFn: () => api.get<AuditPage>(`/audit?offset=${offset}&limit=${limit}`),
    // Прошлое не меняется: перезапрашивать журнал при каждом возврате
    // на вкладку незачем.
    staleTime: 60_000,
  });
}
