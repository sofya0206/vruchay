import { FormEvent, useState } from 'react';
import { Award, LoaderCircle } from 'lucide-react';
import { useLogin } from '../auth/useAuth';
import { ApiError } from '../api/client';
import { Button } from '../ui/Button';
import { Input, Label } from '../ui/Field';

export function LoginPage() {
  const login = useLogin();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    login.mutate({ email, password });
  }

  const error = login.error instanceof ApiError ? login.error.message : null;

  return (
    <div className="grid h-full place-items-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)]">
            <Award size={22} strokeWidth={1.75} />
          </span>
          <div>
            <h1 className="text-2xl leading-tight font-semibold">Вручай</h1>
            <p className="text-sm text-[var(--text-muted)]">Наградные документы</p>
          </div>
        </div>

        <form
          onSubmit={onSubmit}
          className="space-y-5 rounded-2xl bg-[var(--surface)] p-7 ring-1 ring-[var(--line)]"
        >
          <label className="block">
            <Label>Электронная почта</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="username"
              autoFocus
            />
          </label>

          <label className="block">
            <Label>Пароль</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
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
            disabled={login.isPending}
            className="w-full"
            icon={login.isPending ? <LoaderCircle size={16} className="animate-spin" /> : undefined}
          >
            {login.isPending ? 'Входим' : 'Войти'}
          </Button>
        </form>

        {/* Ссылка на политику обязана быть доступна всем, а не только вошедшим. */}
        <p className="mt-6 text-center text-xs text-[var(--text-muted)]">
          <a href="/privacy" className="underline underline-offset-2 hover:text-[var(--text)]">
            Политика обработки персональных данных
          </a>
        </p>
      </div>
    </div>
  );
}
