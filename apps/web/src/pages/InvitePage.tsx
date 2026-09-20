import { useState } from 'react';
import { Award } from 'lucide-react';
import { useAcceptInvite } from '../api/team';
import { AuthCard, AuthLayout } from '../auth/AuthLayout';
import { Button } from '../ui/Button';
import { ErrorBar } from '../ui/ErrorState';
import { Field, Input } from '../ui/Field';
import { errorText } from '../api/client';

/**
 * Человек открыл ссылку из приглашения и придумывает пароль.
 *
 * Один экран и одно поле по существу: приглашённый секретарь организации
 * не должен ни регистрироваться заново, ни разбираться, куда он попал.
 * Всё, что от него требуется, — придумать пароль.
 */
export function InvitePage() {
  const token = new URLSearchParams(window.location.search).get('token') ?? '';
  const accept = useAcceptInvite();
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');

  const mismatch = repeat.length > 0 && password !== repeat;

  const icon = (
    <span className="grid h-11 w-11 place-items-center rounded-control bg-accent-button text-on-accent">
      <Award size={18} strokeWidth={1.75} />
    </span>
  );

  if (!token) {
    return (
      <AuthLayout icon={icon} title="Вручай">
        <h2 className="text-xl font-medium">Ссылка неполная</h2>
        <p className="mt-2 text-muted">
          Откройте приглашение из письма целиком — вместе с длинной частью после знака вопроса. Проще всего
          нажать кнопку в письме, а не копировать адрес руками.
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout icon={icon} title="Вручай" wide>
      <h2 className="text-xl font-medium">Придумайте пароль</h2>
      <p className="mt-2 text-muted">
        Вас пригласили работать в сервисе «Вручай». Осталось придумать пароль — и можно начинать. Больше ничего
        заполнять не нужно.
      </p>

      <AuthCard className="mt-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            accept.mutate({ token, password });
          }}
          className="space-y-4"
        >
          <Field label="Пароль" help="Не короче 10 знаков, хотя бы одна буква и одна цифра.">
            <Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
          </Field>

          <Field label="Пароль ещё раз" error={mismatch ? 'Пароли не совпадают' : undefined}>
            <Input type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} />
          </Field>

          {accept.isError && <ErrorBar>{errorText(accept.error)}</ErrorBar>}

          <Button type="submit" variant="primary" size="lg" disabled={!password || mismatch} loading={accept.isPending} className="w-full">
            Начать работу
          </Button>
        </form>
      </AuthCard>
    </AuthLayout>
  );
}
