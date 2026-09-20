import { FormEvent, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Gift, MailCheck } from 'lucide-react';
import { useRegister } from '../auth/useAuth';
import { forgetRef, rememberRefFromUrl, storedRef } from '../auth/referral-code';
import { useReferralOffer } from '../api/referral';
import { ApiError } from '../api/client';
import { AuthCard, AuthLayout, AuthResult } from '../auth/AuthLayout';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { ErrorBar } from '../ui/ErrorState';
import { Field, Input } from '../ui/Field';

/**
 * Регистрация новой организации.
 *
 * Отдельная страница, а не вкладка на входе: человек с посадочной приходит
 * сюда по кнопке «Начать бесплатно», и промежуточный выбор «вход или
 * регистрация» на этом пути лишний.
 */
export function RegisterPage() {
  const register = useRegister();
  const { search } = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [orgName, setOrgName] = useState('');
  const [name, setName] = useState('');
  const [website, setWebsite] = useState('');

  // Код из ссылки друга откладываем сразу: если человек уйдёт со страницы
  // и вернётся уже без ?ref в адресе, приглашение не пропадёт.
  useEffect(() => rememberRefFromUrl(search), [search]);
  const invitedBy = storedRef();
  const offer = useReferralOffer(invitedBy).data;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    register.mutate({ email, password, orgName, name, website, ref: invitedBy }, { onSuccess: forgetRef });
  }

  const error = register.error instanceof ApiError ? register.error.message : null;

  // Успех выглядит одинаково и для нового адреса, и для уже занятого:
  // сервер намеренно не сообщает, какой это случай, — иначе форма
  // регистрации становится способом проверять, кто есть в сервисе.
  if (register.isSuccess) {
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
          Мы отправили письмо на <span className="text-ink">{email}</span>. Откройте ссылку из него — и сразу
          попадёте в кабинет.
        </p>
        <p className="mt-4 text-xs">Письма нет через пару минут? Загляните в «Спам» — новые отправители иногда попадают туда.</p>
      </AuthResult>
    );
  }

  return (
    <AuthLayout title="Вручай" subtitle={`Первые ${offer?.valid ? offer.total : (offer?.freeLimit ?? 50)} документов — бесплатно`}>
      {/* Приглашение подтверждаем до заполнения формы: человек должен
          видеть, что ссылка настоящая и обещанное больше обычного. */}
      {offer?.valid && (
        <Card tone="info" padding="sm" className="mb-6 flex gap-3">
          <Gift size={18} className="mt-0.5 shrink-0 text-accent" aria-hidden />
          <p className="text-sm leading-relaxed">
            {offer.invitedBy ? <>Вас пригласила организация «{offer.invitedBy}».</> : <>Вы пришли по приглашению.</>}{' '}
            Поэтому бесплатных документов будет {offer.total} вместо {offer.freeLimit}.
          </p>
        </Card>
      )}

      <AuthCard>
        <form onSubmit={onSubmit} className="space-y-5">
          <Field label="Организация" help="Название увидят только вы — в документах печатается то, что нарисуете в макете.">
            <Input value={orgName} onChange={(e) => setOrgName(e.target.value)} required maxLength={200} placeholder="Учебный центр «Развитие»" autoFocus />
          </Field>

          <Field label="Ваше имя">
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} autoComplete="name" />
          </Field>

          <Field label="Электронная почта">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={254} autoComplete="username" />
          </Field>

          <Field label="Пароль" help="Не короче 10 знаков.">
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={10}
              maxLength={200}
              autoComplete="new-password"
            />
          </Field>

          {/*
            Приманка для роботов. Скрыта от человека и от экранного диктора,
            поэтому заполнить её может только тот, кто читает разметку.
            Сервер на заполненное поле отвечает как при успехе: робот
            не должен понять, что его отсеяли.
          */}
          <div className="absolute -left-[9999px]" aria-hidden="true">
            <label>
              Сайт
              <input type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
            </label>
          </div>

          {error && <ErrorBar>{error}</ErrorBar>}

          <Button type="submit" variant="primary" size="lg" loading={register.isPending} className="w-full">
            Начать бесплатно
          </Button>

          <p className="text-center text-xs leading-relaxed text-muted">
            Нажимая кнопку, вы соглашаетесь с{' '}
            <a href="/privacy" className="underline underline-offset-2">
              политикой обработки персональных данных
            </a>
            .
          </p>
        </form>
      </AuthCard>

      <p className="mt-6 text-center text-sm text-muted">
        Уже есть учётная запись?{' '}
        <Link to="/login" className="underline underline-offset-2 hover:text-ink">
          Войти
        </Link>
      </p>
    </AuthLayout>
  );
}
