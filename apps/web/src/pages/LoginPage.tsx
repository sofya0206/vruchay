import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLogin, useLoginTotp } from '../auth/useAuth';
import { AuthCard, AuthLayout } from '../auth/AuthLayout';
import { ApiError } from '../api/client';
import { Button } from '../ui/Button';
import { ErrorBar } from '../ui/ErrorState';
import { Field, Input } from '../ui/Field';

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
    <AuthLayout title="Вручай" subtitle="Наградные документы">
      <AuthCard>
        <form onSubmit={onSubmit} className="space-y-5">
          {awaitingCode ? (
            <Field label="Код подтверждения" hint="Шесть цифр из приложения или резервный код">
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
                autoFocus
              />
            </Field>
          ) : (
            <>
              <Field label="Электронная почта">
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="username"
                  autoFocus
                />
              </Field>

              <div>
                <Field label="Пароль">
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                  />
                </Field>
                <p className="mt-1.5 text-right text-sm">
                  <Link to="/forgot" className="text-muted underline underline-offset-2 hover:text-ink">
                    Забыли пароль?
                  </Link>
                </p>
              </div>
            </>
          )}

          {error && <ErrorBar>{error}</ErrorBar>}

          <Button type="submit" variant="primary" size="lg" loading={pending} className="w-full">
            {awaitingCode ? 'Подтвердить' : 'Войти'}
          </Button>
        </form>

        {/* Без этой ссылки тот, кто пришёл с посадочной по кнопке «Войти»,
            упирается в тупик: формы регистрации на странице входа нет. */}
        <p className="text-center text-sm text-muted">
          Ещё нет учётной записи?{' '}
          <Link to="/register" className="underline underline-offset-2 hover:text-ink">
            Зарегистрироваться
          </Link>
        </p>
      </AuthCard>

      {/* Ссылка на политику обязана быть доступна всем, а не только вошедшим. */}
      <p className="mt-4 text-center text-xs text-muted">
        <a href="/privacy" className="underline underline-offset-2 hover:text-ink">
          Политика обработки персональных данных
        </a>
      </p>
    </AuthLayout>
  );
}
