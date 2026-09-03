import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { TriangleAlert } from 'lucide-react';
import { api, ApiError } from '../api/client';
import { Button } from '../ui/Button';
import { Input, Label } from '../ui/Field';

/**
 * Удаление собственной учётной записи.
 *
 * Право забрать свои данные упирается здесь в чужое право: выданные
 * документы принадлежат организации и лежат на руках у награждённых
 * с QR-кодом на бумаге. Поэтому уходит человек, а не следы его работы,
 * и об этом сказано прямо — до того, как он нажмёт кнопку.
 *
 * Препятствия спрашиваем у сервера заранее: узнать про непереданную
 * организацию после ввода пароля — значит потратить решимость впустую.
 */
export function DeleteAccount() {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const blockers = useQuery({
    queryKey: ['account-blockers'],
    queryFn: () => api.get<{ blockers: string[] }>('/auth/account/blockers'),
  });

  const remove = useMutation({
    mutationFn: () => api.delete<{ ok: true }>('/auth/account', { password }),
    onSuccess: () => {
      // Сессии больше нет — возвращаем человека на посадочную,
      // полной перезагрузкой, чтобы кабинет не остался в памяти.
      window.location.href = '/';
    },
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : 'Не получилось — попробуйте ещё раз'),
  });

  const list = blockers.data?.blockers ?? [];
  const blocked = list.length > 0;

  return (
    <section>
      <h2 className="flex items-center gap-2 font-serif text-xl">
        <TriangleAlert size={18} className="text-[var(--danger)]" />
        Удалить учётную запись
      </h2>
      <p className="mt-1 max-w-2xl text-sm text-[var(--text-muted)]">
        Уйдут ваши имя, адрес входа, пароль, второй фактор и сессии. Выданные документы
        останутся: их проверяют по QR-коду посторонние люди, и погасить проверку молча
        нельзя. Записи в журнале организации тоже останутся — иначе он перестанет отвечать
        на вопрос, кто и что сделал.
      </p>

      {blocked && (
        <ul className="mt-4 max-w-2xl space-y-2">
          {list.map((text) => (
            <li
              key={text}
              className="rounded-xl bg-[var(--award-soft)] p-3 text-sm text-[var(--text)]"
            >
              {text}
            </li>
          ))}
        </ul>
      )}

      {!blocked && !open && (
        <Button
          className="mt-4"
          variant="danger"
          size="sm"
          onClick={() => setOpen(true)}
          disabled={blockers.isPending}
        >
          Удалить учётную запись
        </Button>
      )}

      {!blocked && open && (
        <div className="mt-4 max-w-md space-y-3 rounded-2xl bg-[var(--surface)] p-4 ring-1 ring-[var(--danger)]">
          <p className="text-sm">
            Это необратимо. Введите пароль, чтобы подтвердить, — так учётную запись не удалит
            тот, кто просто сел за ваш открытый компьютер.
          </p>
          <div>
            <Label>Пароль</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-[var(--danger)]">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="danger"
              size="sm"
              disabled={password.length === 0 || remove.isPending}
              onClick={() => {
                setError('');
                remove.mutate();
              }}
            >
              {remove.isPending ? 'Удаляем…' : 'Удалить навсегда'}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Отмена
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
