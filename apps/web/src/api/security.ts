import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';

export interface TotpStatus {
  enabled: boolean;
  enabledAt: string | null;
  /** Сколько резервных кодов ещё не использовано. */
  backupCodesLeft: number;
}

export interface TotpSetup {
  /** Секрет буквами — на случай, если камера не читает QR. */
  secret: string;
  /** Ссылка otpauth://, из неё рисуется QR. */
  otpauth: string;
}

export interface UserSession {
  id: string;
  ip: string | null;
  /** «Chrome, macOS» — по строке User-Agent человек своё устройство не узнаёт. */
  device: string;
  createdAt: string;
  lastSeenAt: string;
  /** Та, из которой открыт кабинет прямо сейчас. */
  current: boolean;
}

export type LoginOutcome = 'success' | 'wrong_password' | 'wrong_code' | 'not_verified';

export interface LoginEvent {
  id: string;
  outcome: LoginOutcome;
  ip: string | null;
  device: string;
  createdAt: string;
}

export const securityApi = {
  totpStatus: () => api.get<TotpStatus>('/auth/totp'),
  totpSetup: () => api.post<TotpSetup>('/auth/totp/setup'),
  totpEnable: (code: string) => api.post<{ backupCodes: string[] }>('/auth/totp/enable', { code }),
  totpDisable: (password: string, code: string) =>
    api.post<{ ok: true }>('/auth/totp/disable', { password, code }),
  regenerateBackupCodes: (password: string) =>
    api.post<{ backupCodes: string[] }>('/auth/totp/backup-codes', { password }),

  sessions: () => api.get<UserSession[]>('/auth/sessions'),
  logins: () => api.get<LoginEvent[]>('/auth/sessions/logins'),
  revoke: (id: string) => api.delete<{ ok: true }>(`/auth/sessions/${id}`),
  revokeOthers: () => api.delete<{ closed: number }>('/auth/sessions/others'),
};

export function useTotpStatus() {
  return useQuery({ queryKey: ['totp'], queryFn: securityApi.totpStatus });
}

export function useSessions() {
  return useQuery({ queryKey: ['sessions'], queryFn: securityApi.sessions });
}

export function useLoginHistory() {
  return useQuery({ queryKey: ['login-events'], queryFn: securityApi.logins });
}

export function useSessionMutations() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ['sessions'] });
  return {
    revoke: useMutation({ mutationFn: securityApi.revoke, onSuccess: refresh }),
    revokeOthers: useMutation({ mutationFn: securityApi.revokeOthers, onSuccess: refresh }),
  };
}
