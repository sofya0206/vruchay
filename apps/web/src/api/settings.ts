import { api } from './client';

export interface DnsRecord {
  type: string;
  host: string;
  value: string;
  /** Пояснение «зачем эта запись» — без него человек не понимает, что вставляет. */
  purpose: string;
}

export interface Sender {
  id: string;
  email: string;
  displayName: string;
  isDefault: boolean;
}

export interface MailDomain {
  id: string;
  domain: string;
  status: 'pending' | 'verified' | 'failed';
  dnsRecords: DnsRecord[];
  lastCheckedAt: string | null;
  verifiedAt: string | null;
  senders: Sender[];
}

export interface Integration {
  id: string;
  name: string;
  token: string;
  allowedDomains: string[];
  documentIds: string[];
  authMode: 'none' | 'email_code';
  /** Сверять адрес с реестром получателей документа. */
  checkList: boolean;
  /** Принимать только изнутри личного кабинета площадки. */
  requireAccount: boolean;
  singleFilePerEmail: boolean;
  dailyLimit: number;
  successMessage: string;
  showDownload: boolean;
  sendEmail: boolean;
  copyToEmail: string | null;
  active: boolean;
  _count?: { requests: number };
}

export interface TildaRequest {
  id: string;
  email: string;
  fields: Record<string, string>;
  status: 'pending_otp' | 'processing' | 'done' | 'failed' | 'rejected';
  error: string | null;
  createdAt: string;
  doneAt: string | null;
  documentId: string;
}

export const settingsApi = {
  domains: () => api.get<MailDomain[]>('/mail/domains'),
  addDomain: (domain: string) => api.post<MailDomain>('/mail/domains', { domain }),
  checkDomain: (id: string) => api.post<MailDomain>(`/mail/domains/${id}/check`),
  deleteDomain: (id: string) => api.delete<{ ok: true }>(`/mail/domains/${id}`),
  addSender: (domainId: string, email: string, displayName: string) =>
    api.post<Sender>('/mail/senders', { domainId, email, displayName }),

  integrations: () => api.get<Integration[]>('/integrations/tilda'),
  createIntegration: (body: unknown) => api.post<Integration>('/integrations/tilda', body),
  updateIntegration: (id: string, body: unknown) =>
    api.patch<Integration>(`/integrations/tilda/${id}`, body),
  deleteIntegration: (id: string) => api.delete<{ ok: true }>(`/integrations/tilda/${id}`),
  requests: (integrationId: string) =>
    api.get<TildaRequest[]>(`/integrations/tilda/requests?integrationId=${integrationId}`),
};
