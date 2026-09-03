import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import type { Me } from '../api/types';

/**
 * Кто вошёл. `null` — точно никто, `undefined` — ещё не выяснили.
 *
 * Различие важно: пока не выяснили, показываем «Загрузка…», а не форму
 * входа, иначе при каждом открытии кабинета мигала бы посадочная страница.
 */
export function useMe() {
  return useQuery<Me | null>({
    queryKey: ['me'],
    queryFn: () => api.get<Me>('/auth/me'),
    retry: false,
  });
}

/**
 * Ответ на верный пароль: либо вошли, либо ждём код второго фактора.
 * Сессии во втором случае ещё нет — в кэш класть нечего.
 */
export type LoginResult = Me | { totpRequired: true };

function isTotpRequired(result: LoginResult): result is { totpRequired: true } {
  return 'totpRequired' in result;
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (creds: { email: string; password: string }) =>
      api.post<LoginResult>('/auth/login', creds),
    onSuccess: (result) => {
      if (!isTotpRequired(result)) qc.setQueryData(['me'], result);
    },
  });
}

/** Второй шаг входа: код из приложения или резервный код с бумажки. */
export function useLoginTotp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => api.post<Me>('/auth/login/totp', { code }),
    onSuccess: (me) => qc.setQueryData(['me'], me),
  });
}

export interface RegisterInput {
  email: string;
  password: string;
  orgName: string;
  name: string;
  /** Приманка для роботов: настоящий человек это поле не видит и не заполняет. */
  website?: string;
  /** Код из ссылки друга, если человек пришёл по приглашению. */
  ref?: string;
}

export function useRegister() {
  return useMutation({
    mutationFn: (input: RegisterInput) => api.post<{ ok: true }>('/auth/register', input),
  });
}

export function useResendVerification() {
  return useMutation({
    mutationFn: (email: string) => api.post<{ ok: true }>('/auth/resend-verification', { email }),
  });
}

export function useVerifyEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (token: string) => api.post<Me>('/auth/verify', { token }),
    // Подтверждение сразу создаёт сессию — кладём пользователя в кэш,
    // чтобы приложение не отправило его снова на страницу входа.
    onSuccess: (me) => qc.setQueryData(['me'], me),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ ok: true }>('/auth/logout'),
    onSuccess: () => {
      /*
       * Сначала гасим признак входа, потом убираем остальное.
       *
       * Раньше здесь стоял qc.clear(), и выход не работал: он выбрасывает
       * из кэша в том числе запись о вошедшем, а приложение решает по ней,
       * что показывать. Наблюдатель оставался без данных и без запроса —
       * страница застывала, и человек выходил только обновлением.
       *
       * Явное null вместо удаления: оно означает «точно не вошёл»,
       * тогда как пустота означает «пока не знаем».
       */
      qc.setQueryData(['me'], null);
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
    },
  });
}
