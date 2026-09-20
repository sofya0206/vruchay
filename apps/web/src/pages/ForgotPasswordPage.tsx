import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { KeyRound, MailCheck } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { api } from '../api/client';
import { AuthCard, AuthLayout, AuthResult } from '../auth/AuthLayout';
import { Button } from '../ui/Button';
import { Field, Input } from '../ui/Field';

/**
 * «Забыли пароль».
 *
 * Без этой страницы человек, забывший пароль, заперт снаружи навсегда —
 * а наши пользователи пароли забывают, это часть работы с ними,
 * а не редкий сбой.
 */
export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const send = useMutation({
    mutationFn: () => api.post<{ ok: true }>('/auth/forgot', { email }),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    send.mutate();
  }

  // Успех выглядит одинаково и для знакомого адреса, и для незнакомого:
  // сервер намеренно не отвечает на вопрос «а есть тут такой человек».
  if (send.isSuccess) {
    return (
      <AuthResult
        icon={<MailCheck size={26} strokeWidth={1.75} />}
        title="Проверьте почту"
        footer={
          <Link to="/login" className="text-sm underline underline-offset-2">
            Вернуться ко входу
          </Link>
        }
      >
        <p>
          Если такой адрес у нас есть, мы отправили на <span className="text-ink">{email}</span> письмо со
          ссылкой. Откройте её и придумайте новый пароль.
        </p>
        <p className="mt-4 text-xs">Ссылка действует один час. Письма нет через пару минут? Загляните в «Спам».</p>
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
      title="Забыли пароль"
      subtitle="Введите адрес, которым входите"
    >
      <AuthCard>
        <form onSubmit={onSubmit} className="space-y-5">
          <Field label="Электронная почта">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              maxLength={254}
              autoComplete="username"
              autoFocus
            />
          </Field>

          <Button type="submit" variant="primary" size="lg" loading={send.isPending} className="w-full">
            Прислать ссылку
          </Button>
        </form>
      </AuthCard>

      <p className="mt-6 text-center text-sm text-muted">
        Вспомнили?{' '}
        <Link to="/login" className="underline underline-offset-2 hover:text-ink">
          Войти
        </Link>
      </p>
    </AuthLayout>
  );
}
