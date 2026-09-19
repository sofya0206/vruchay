import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';

export type TicketStatus = 'open' | 'answered' | 'closed';

export interface TicketSummary {
  id: string;
  subject: string;
  status: TicketStatus;
  createdAt: string;
  updatedAt: string;
  author: string;
  messages: number;
}

export interface TicketMessage {
  id: string;
  text: string;
  fromSupport: boolean;
  createdAt: string;
  author: string;
}

export interface Ticket {
  id: string;
  subject: string;
  status: TicketStatus;
  createdAt: string;
  messages: TicketMessage[];
}

export type RoadmapStatus = 'planned' | 'in_progress' | 'done';

export interface RoadmapItem {
  id: string;
  title: string;
  description: string;
  status: RoadmapStatus;
  votes: number;
  voted: boolean;
}

export const supportApi = {
  tickets: () => api.get<TicketSummary[]>('/support/tickets'),
  ticket: (id: string) => api.get<Ticket>(`/support/tickets/${id}`),
  create: (subject: string, text: string) =>
    api.post<{ id: string }>('/support/tickets', { subject, text }),
  reply: (id: string, text: string) =>
    api.post<{ ok: true }>(`/support/tickets/${id}/messages`, { text }),
  close: (id: string) => api.post<{ ok: true }>(`/support/tickets/${id}/close`),

  roadmap: () => api.get<RoadmapItem[]>('/roadmap'),
  vote: (id: string) => api.post<{ ok: true }>(`/roadmap/${id}/vote`),
  unvote: (id: string) => api.delete<{ ok: true }>(`/roadmap/${id}/vote`),
};

export function useTickets() {
  return useQuery({ queryKey: ['support-tickets'], queryFn: supportApi.tickets });
}

export function useTicket(id: string | null) {
  return useQuery({
    queryKey: ['support-ticket', id],
    queryFn: () => supportApi.ticket(id as string),
    enabled: Boolean(id),
  });
}

export function useRoadmap() {
  return useQuery({ queryKey: ['roadmap'], queryFn: supportApi.roadmap });
}

/*
 * Отказ не показываем намеренно. Предсказуемо голос не падает: роль
 * не проверяется, повторный голос и снятие несуществующего сервер
 * принимает молча, а 404 бывает, только если пункт убрали, пока страница
 * открыта. Остаются сеть и пятисотая — и тогда счётчик не сдвигается:
 * голос не рисуется заранее, поэтому экран не врёт.
 */
export function useRoadmapVote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, voted }: { id: string; voted: boolean }) =>
      voted ? supportApi.unvote(id) : supportApi.vote(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['roadmap'] }),
  });
}
