import { useQuery } from '@tanstack/react-query';
import { api } from './client';
import type { Usage } from './org';

export type JobStatus = 'queued' | 'running' | 'done' | 'failed' | 'canceled';

export interface OverviewDocument {
  id: string;
  title: string;
  eventName: string;
  eventDate: string;
  updatedAt: string;
}

export interface OverviewJob {
  id: string;
  documentId: string;
  documentTitle: string;
  status: JobStatus;
  total: number;
  done: number;
  failed: number;
  createdAt: string;
}

export interface Overview {
  usage: Usage;
  /** Выпущено документов за всё время. */
  issuedTotal: number;
  issuedMonth: number;
  /** Выпущено за прошлый календарный месяц — для сравнения с текущим. */
  issuedPrevMonth: number;
  emailsSent: number;
  /** Судьба ушедших писем за всё время. */
  mail: { delivered: number; undelivered: number };
  /** Документов, проверенных по QR с начала месяца. */
  verifiedMonth: number;
  /** Проверок по QR за всё время. */
  verificationsTotal: number;
  /** Материалов в работе; ноль означает, что организация ещё ничего не начинала. */
  materials: number;
  documents: OverviewDocument[];
  jobs: OverviewJob[];
}

export function useOverview() {
  return useQuery({ queryKey: ['overview'], queryFn: () => api.get<Overview>('/overview') });
}
