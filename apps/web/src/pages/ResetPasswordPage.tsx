import { FormEvent, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../api/client';
import { AuthCard, AuthLayout, AuthResult } from '../auth/AuthLayout';
import { Button } from '../ui/Button';
import { ErrorBar } from '../ui/ErrorState';
import { Field, Input } from '../ui/Field';

/**
 * Новый пароль по ссылке из письма.
 *
 * После успеха человек попадает в кабинет сразу: заставлять его ещё раз
 * вводить логин и только что придуманный пароль — лишний шаг ровно там,
 * где он и так раздражён тем, что пароль забыл.
 */
export function ResetPasswordPage() {
  const { search } = useLocation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const token = new URLSearchParams(search).get('token') ?? '';

  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');

  const reset = useMutation({
    mutationFn: () =>
      api.post<{ email: string; name: string; role: string }>('/auth/reset', { token, password }),
    onSuccess: (me) => {
      qc.setQueryData(['me'], me);
      navigate('/', { replace: true });
    },
  });

  const mismatch = repeat.length > 0 && password !== repeat;
  const ready = password.length > 0 && !mismatch && token.length > 0;
  const error = reset.error instanceof ApiError ? reset.error.message : null;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    reset.mutate();
  }

  if (!token) {
    return (
      <AuthResult
        icon={<KeyRound size={26} strokeWidth={1.75} />}
        title="Ссылка неполная"
        footer={
          <Link to="/forgot" className="text-sm underline underline-offset-2">
            Запросить новое письмо
          </Link>
        }
      >
        Похоже, адрес скопировался не целиком. Откройте ссылку из письма ещё раз — лучше нажатием на кнопку
        в самом письме.
      </AuthResult>
    );
  }

  return (
    <AuthLayout
      icon={
        <span className="grid h-14 w-14 place-items-center rounded-sheet bg-accent-soft text-accent">
          <KeyRound size={26} strokeWidth={1.75} />
        </span>
      }
      title="Новый пароль"
      subtitle="Придумайте пароль — и сразу попадёте в кабинет"
    >
      <AuthCard>
        <form onSubmit={onSubmit} className="space-y-5">
          <Field label="Новый пароль" help="Не короче 10 знаков, хотя бы одна буква и одна цифра.">
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={10}
              maxLength={200}
              autoComplete="new-password"
              autoFocus
            />
          </Field>

          <Field label="Тот же пароль ещё раз" error={mismatch ? 'Пароли не совпадают' : undefined}>
            <Input
              type="password"
              value={repeat}
              onChange={(e) => setRepeat(e.target.value)}
              required
              maxLength={200}
              autoComplete="new-password"
            />
          </Field>

          {error && <ErrorBar>{error}</ErrorBar>}

          <Button type="submit" variant="primary" size="lg" disabled={!ready} loading={reset.isPending} className="w-full">
            Сохранить и войти
          </Button>
        </form>
      </AuthCard>
    </AuthLayout>
  );
}
