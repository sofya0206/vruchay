import { useState } from 'react';
import { Award } from 'lucide-react';
import { useAcceptInvite } from '../api/team';
import { Button } from '../ui/Button';
import { Input, Label } from '../ui/Field';
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

  if (!token) {
    return (
      <Frame>
        <h1 className="font-serif text-2xl">Ссылка неполная</h1>
        <p className="mt-2 text-[var(--text-muted)]">
          Откройте приглашение из письма целиком — вместе с длинной частью после знака вопроса.
          Проще всего нажать кнопку в письме, а не копировать адрес руками.
        </p>
      </Frame>
    );
  }

  return (
    <Frame>
      <h1 className="font-serif text-2xl">Придумайте пароль</h1>
      <p className="mt-2 text-[var(--text-muted)]">
        Вас пригласили работать в сервисе «Вручай». Осталось придумать пароль — и можно
        начинать. Больше ничего заполнять не нужно.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          accept.mutate({ token, password });
        }}
        className="mt-6 space-y-4"
      >
        <div>
          <Label>Пароль</Label>
          <Input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
          <p className="mt-1.5 text-sm text-[var(--text-muted)]">
            Не короче 10 знаков, хотя бы одна буква и одна цифра.
          </p>
        </div>

        <div>
          <Label>Пароль ещё раз</Label>
          <Input
            type="password"
            autoComplete="new-password"
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
          />
          {mismatch && <p className="mt-1.5 text-sm text-[var(--danger)]">Пароли не совпадают</p>}
        </div>

        {accept.isError && (
          <p role="alert" className="text-sm text-[var(--danger)]">
            {errorText(accept.error)}
          </p>
        )}

        <Button
          type="submit"
          variant="primary"
          className="w-full"
          disabled={!password || mismatch || accept.isPending}
        >
          {accept.isPending ? 'Входим…' : 'Начать работу'}
        </Button>
      </form>
    </Frame>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-full place-items-center px-6 py-12">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-[var(--accent)] text-[var(--accent-contrast)]">
            <Award size={18} strokeWidth={1.75} />
          </span>
          <span className="font-serif text-lg">Вручай</span>
        </div>
        {children}
      </div>
    </div>
  );
}
