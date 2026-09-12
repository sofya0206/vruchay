import { FormEvent, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Gift, LoaderCircle, MailCheck } from 'lucide-react';
import { Brand } from '../shell/Brand';
import { useRegister } from '../auth/useAuth';
import { forgetRef, rememberRefFromUrl, storedRef } from '../auth/referral-code';
import { useReferralOffer } from '../api/referral';
import { ApiError } from '../api/client';
import { Button } from '../ui/Button';
import { Input, Label } from '../ui/Field';

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
    register.mutate(
      { email, password, orgName, name, website, ref: invitedBy },
      { onSuccess: forgetRef },
    );
  }

  const error = register.error instanceof ApiError ? register.error.message : null;

  // Успех выглядит одинаково и для нового адреса, и для уже занятого:
  // сервер намеренно не сообщает, какой это случай, — иначе форма
  // регистрации становится способом проверять, кто есть в сервисе.
  if (register.isSuccess) {
    return (
      <div className="grid h-full place-items-center p-6">
        <div className="w-full max-w-sm text-center">
          <span className="mx-auto mb-6 grid h-14 w-14 place-items-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
            <MailCheck size={26} strokeWidth={1.75} />
          </span>
          <h1 className="font-serif text-2xl">Проверьте почту</h1>
          <p className="mt-3 text-sm leading-relaxed text-[var(--text-muted)]">
            Мы отправили письмо на <span className="text-[var(--text)]">{email}</span>. Откройте
            ссылку из него — и сразу попадёте в кабинет.
          </p>
          <p className="mt-4 text-xs text-[var(--text-muted)]">
            Письма нет через пару минут? Загляните в «Спам» — новые отправители иногда попадают
            туда.
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
        <div className="mb-8 flex items-center gap-3">
          <Brand size={44} />
          <div>
            <h1 className="text-2xl leading-tight font-semibold">Вручай</h1>
            <p className="text-sm text-[var(--text-muted)]">
              Первые {offer?.valid ? offer.total : (offer?.freeLimit ?? 50)} документов — бесплатно
            </p>
          </div>
        </div>

        {/* Приглашение подтверждаем до заполнения формы: человек должен
            видеть, что ссылка настоящая и обещанное больше обычного, — иначе
            он не поймёт, за что ему дали больше, и решит, что это ошибка. */}
        {offer?.valid && (
          <div className="mb-6 flex gap-3 rounded-2xl bg-[var(--accent-soft)] p-4">
            <Gift size={18} className="mt-0.5 shrink-0 text-[var(--accent)]" />
            <p className="text-sm leading-relaxed">
              {offer.invitedBy ? (
                <>
                  Вас пригласила организация «{offer.invitedBy}».
                </>
              ) : (
                <>Вы пришли по приглашению.</>
              )}{' '}
              Поэтому бесплатных документов будет {offer.total} вместо {offer.freeLimit}.
            </p>
          </div>
        )}

        <form
          onSubmit={onSubmit}
          className="space-y-5 rounded-2xl bg-[var(--surface)] p-7 ring-1 ring-[var(--line)]"
        >
          <label className="block">
            <Label>Организация</Label>
            <Input
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              required
              maxLength={200}
              placeholder="Учебный центр «Развитие»"
              autoFocus
            />
            <span className="mt-1.5 block text-xs text-[var(--text-muted)]">
              Название увидят только вы — в документах печатается то, что нарисуете в макете.
            </span>
          </label>

          <label className="block">
            <Label>Ваше имя</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={200}
              autoComplete="name"
            />
          </label>

          <label className="block">
            <Label>Электронная почта</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              maxLength={254}
              autoComplete="username"
            />
          </label>

          <label className="block">
            <Label>Пароль</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={10}
              maxLength={200}
              autoComplete="new-password"
            />
            <span className="mt-1.5 block text-xs text-[var(--text-muted)]">
              Не короче 10 знаков.
            </span>
          </label>

          {/*
            Приманка для роботов. Скрыта от человека и от экранного диктора,
            поэтому заполнить её может только тот, кто читает разметку,
            а не страницу. Сервер на заполненное поле отвечает как при успехе:
            робот не должен понять, что его отсеяли.
          */}
          <div className="absolute -left-[9999px]" aria-hidden="true">
            <label>
              Сайт
              <input
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
              />
            </label>
          </div>

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
            disabled={register.isPending}
            className="w-full"
            icon={
              register.isPending ? <LoaderCircle size={16} className="animate-spin" /> : undefined
            }
          >
            {register.isPending ? 'Создаём' : 'Начать бесплатно'}
          </Button>

          <p className="text-center text-xs leading-relaxed text-[var(--text-muted)]">
            Нажимая кнопку, вы соглашаетесь с{' '}
            <a href="/privacy" className="underline underline-offset-2">
              политикой обработки персональных данных
            </a>
            .
          </p>
        </form>

        <p className="mt-6 text-center text-sm text-[var(--text-muted)]">
          Уже есть учётная запись?{' '}
          <Link to="/login" className="underline underline-offset-2 hover:text-[var(--text)]">
            Войти
          </Link>
        </p>
      </div>
    </div>
  );
}
