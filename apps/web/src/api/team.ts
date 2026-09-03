import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';

export type TeamRole = 'owner' | 'admin' | 'member';

export interface TeamMember {
  userId: string;
  email: string;
  name: string;
  role: TeamRole;
  /** Приглашение отправлено, но человек ещё не задал пароль. */
  pending: boolean;
  joinedAt: string;
}

/** Право и то, каким ролям оно доступно. Приходит с сервера — там же, где проверяется. */
export interface Permission {
  key: string;
  title: string;
  roles: Record<TeamRole, boolean>;
}

export interface RolesInfo {
  roles: { role: TeamRole; title: string }[];
  permissions: Permission[];
}

export function useRoles() {
  return useQuery({
    queryKey: ['team-roles'],
    queryFn: () => api.get<RolesInfo>('/team/roles'),
    // Таблица прав меняется вместе с кодом, а не в течение дня.
    staleTime: 60 * 60 * 1000,
  });
}

export function useTeam() {
  return useQuery({
    queryKey: ['team'],
    queryFn: () => api.get<{ members: TeamMember[] }>('/team'),
  });
}

export function useTeamMutations() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ['team'] });

  return {
    invite: useMutation({
      mutationFn: (v: { email: string; name: string; role: 'admin' | 'member' }) =>
        api.post<{ added: boolean; invited: boolean }>('/team/invite', v),
      onSuccess: refresh,
    }),
    resend: useMutation({
      mutationFn: (userId: string) => api.post<{ ok: true }>(`/team/${userId}/resend`, {}),
    }),
    setRole: useMutation({
      mutationFn: (v: { userId: string; role: 'admin' | 'member' }) =>
        api.patch<{ ok: true }>(`/team/${v.userId}`, { role: v.role }),
      onSuccess: refresh,
    }),
    remove: useMutation({
      mutationFn: (userId: string) => api.delete<{ ok: true }>(`/team/${userId}`),
      onSuccess: refresh,
    }),
    changePassword: useMutation({
      mutationFn: (v: { current: string; next: string }) =>
        api.post<{ ok: true }>('/team/password', v),
    }),
  };
}

/** Принятие приглашения — без входа, человек ещё не может войти. */
export function useAcceptInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { token: string; password: string }) =>
      api.post<{ email: string; name: string; role: TeamRole }>('/team-invite/accept', v),
    // Сервер уже создал сессию — кладём пользователя в кэш, чтобы приложение
    // сразу показало кабинет, а не форму входа.
    onSuccess: (me) => qc.setQueryData(['me'], me),
  });
}
