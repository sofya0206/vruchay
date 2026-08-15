import { FormEvent, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { KeyRound, LoaderCircle } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../api/client';
import { Button } from '../ui/Button';
import { Input, Label } from '../ui/Field';

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
    mutationFn: () => api.post<{ email: string; name: string; role: string }>('/auth/reset', {
      token,
      password,
    }),
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
      <div className="grid h-full place-items-center p-6">
        <div className="w-full max-w-sm text-center">
          <h1 className="font-serif text-2xl">Ссылка неполная</h1>
          <p className="mt-3 text-sm leading-relaxed text-[var(--text-muted)]">
            Похоже, адрес скопировался не целиком. Откройте ссылку из письма ещё раз —
            лучше нажатием на кнопку в самом письме.
          </p>
          <Link
            to="/forgot"
            className="mt-8 inline-block text-sm underline underline-offset-2"
          >
            Запросить новое письмо
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="grid h-full place-items-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
            <KeyRound size={26} strokeWidth={1.75} />
          </span>
          <h1 className="font-serif text-2xl">Новый пароль</h1>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            Придумайте пароль — и сразу попадёте в кабинет.
          </p>
        </div>

        <form
          onSubmit={onSubmit}
          className="space-y-5 rounded-2xl bg-[var(--surface)] p-7 ring-1 ring-[var(--line)]"
        >
          <label className="block">
            <Label>Новый пароль</Label>
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
            <span className="mt-1.5 block text-xs text-[var(--text-muted)]">
              Не короче 10 знаков, хотя бы одна буква и одна цифра.
            </span>
          </label>

          <label className="block">
            <Label>Тот же пароль ещё раз</Label>
            <Input
              type="password"
              value={repeat}
              onChange={(e) => setRepeat(e.target.value)}
              required
              maxLength={200}
              autoComplete="new-password"
            />
            {mismatch && (
              <span className="mt-1.5 block text-xs text-[var(--danger)]">
                Пароли не совпадают
              </span>
            )}
          </label>

          {error && (
            <p
              role="alert"
              className="rounded-lg bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]"
            >
              {error}
            </p>
          )}

          <Button
            type="submit"
            variant="primary"
            disabled={!ready || reset.isPending}
            className="w-full"
            icon={reset.isPending ? <LoaderCircle size={16} className="animate-spin" /> : undefined}
          >
            {reset.isPending ? 'Сохраняем' : 'Сохранить и войти'}
          </Button>
        </form>
      </div>
    </div>
  );
}
