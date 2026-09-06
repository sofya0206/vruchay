import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { Award, LoaderCircle } from 'lucide-react';
import { useLogin, useLoginTotp } from '../auth/useAuth';
import { ApiError } from '../api/client';
import { Button } from '../ui/Button';
import { Input, Label } from '../ui/Field';

export function LoginPage() {
  const login = useLogin();
  const totp = useLoginTotp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');

  // Пароль подошёл, но у человека включён второй фактор: пароль с экрана
  // убираем — вводить его заново не надо, а держать на виду незачем.
  const awaitingCode = login.data !== undefined && 'totpRequired' in login.data;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (awaitingCode) totp.mutate(code);
    else login.mutate({ email, password });
  }

  const failed = awaitingCode ? totp.error : login.error;
  const error = failed instanceof ApiError ? failed.message : null;
  const pending = login.isPending || totp.isPending;

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
          {awaitingCode ? (
            <label className="block">
              <Label hint="Шесть цифр из приложения или резервный код">Код подтверждения</Label>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
                autoFocus
              />
            </label>
          ) : (
            <>
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

              <p className="text-right text-sm">
                <Link
                  to="/forgot"
                  className="text-[var(--text-muted)] underline underline-offset-2 hover:text-[var(--text)]"
                >
                  Забыли пароль?
                </Link>
              </p>
            </>
          )}

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
            disabled={pending}
            className="w-full"
            icon={pending ? <LoaderCircle size={16} className="animate-spin" /> : undefined}
          >
            {pending ? 'Входим' : awaitingCode ? 'Подтвердить' : 'Войти'}
          </Button>
        </form>

        {/* Без этой ссылки тот, кто пришёл с посадочной по кнопке «Войти»,
            упирается в тупик: формы регистрации на странице входа нет. */}
        <p className="mt-6 text-center text-sm text-[var(--text-muted)]">
          Ещё нет учётной записи?{' '}
          <Link to="/register" className="underline underline-offset-2 hover:text-[var(--text)]">
            Зарегистрироваться
          </Link>
        </p>

        {/* Ссылка на политику обязана быть доступна всем, а не только вошедшим. */}
        <p className="mt-4 text-center text-xs text-[var(--text-muted)]">
          <a href="/privacy" className="underline underline-offset-2 hover:text-[var(--text)]">
            Политика обработки персональных данных
          </a>
        </p>
      </div>
    </div>
  );
}
