import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { KeyRound, LoaderCircle, MailCheck } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { api } from '../api/client';
import { Button } from '../ui/Button';
import { Input, Label } from '../ui/Field';

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
      <div className="grid h-full place-items-center p-6">
        <div className="w-full max-w-sm text-center">
          <span className="mx-auto mb-6 grid h-14 w-14 place-items-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
            <MailCheck size={26} strokeWidth={1.75} />
          </span>
          <h1 className="font-serif text-2xl">Проверьте почту</h1>
          <p className="mt-3 text-sm leading-relaxed text-[var(--text-muted)]">
            Если такой адрес у нас есть, мы отправили на{' '}
            <span className="text-[var(--text)]">{email}</span> письмо со ссылкой. Откройте
            её и придумайте новый пароль.
          </p>
          <p className="mt-4 text-xs leading-relaxed text-[var(--text-muted)]">
            Ссылка действует один час. Письма нет через пару минут? Загляните в «Спам».
          </p>
          <Link to="/login" className="mt-8 inline-block text-sm underline underline-offset-2">
            Вернуться ко входу
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
          <h1 className="font-serif text-2xl">Забыли пароль</h1>
          <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
            Введите адрес, которым входите в «Вручай». Пришлём письмо со ссылкой —
            по ней придумаете новый пароль.
          </p>
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
              maxLength={254}
              autoComplete="username"
              autoFocus
            />
          </label>

          <Button
            type="submit"
            variant="primary"
            disabled={send.isPending}
            className="w-full"
            icon={send.isPending ? <LoaderCircle size={16} className="animate-spin" /> : undefined}
          >
            {send.isPending ? 'Отправляем' : 'Прислать ссылку'}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-[var(--text-muted)]">
          Вспомнили?{' '}
          <Link to="/login" className="underline underline-offset-2 hover:text-[var(--text)]">
            Войти
          </Link>
        </p>
      </div>
    </div>
  );
}
