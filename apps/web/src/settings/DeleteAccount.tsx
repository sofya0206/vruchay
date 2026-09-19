import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api, ApiError } from '../api/client';
import { Button } from '../ui/Button';
import { Field, Input } from '../ui/Field';
import { DangerZone } from '../ui/Settings';

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
    <DangerZone
      title="Удалить учётную запись"
      about="Уйдут имя, адрес входа, пароль и сессии. Выданные документы и записи в журнале организации останутся."
      action={
        !blocked &&
        !open && (
          <Button variant="danger" size="sm" onClick={() => setOpen(true)} disabled={blockers.isPending}>
            Удалить…
          </Button>
        )
      }
    >
      {blocked && (
        <ul className="mt-3 space-y-2">
          {list.map((text) => (
            <li key={text} className="rounded-lg bg-[var(--warn-soft)] px-3 py-2 text-sm text-[var(--text)]">
              {text}
            </li>
          ))}
        </ul>
      )}

      {!blocked && open && (
        <form
          className="mt-4 max-w-sm space-y-3 border-t border-[var(--line)] pt-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (password.length === 0) return;
            setError('');
            remove.mutate();
          }}
        >
          <Field
            label="Пароль"
            help="Это необратимо. Пароль подтверждает, что удаляете вы, а не тот, кто сел за открытый компьютер."
            error={error || undefined}
          >
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              autoFocus
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button
              type="submit"
              variant="danger"
              size="sm"
              disabled={password.length === 0 || remove.isPending}
            >
              {remove.isPending ? 'Удаляем…' : 'Удалить навсегда'}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Отмена
            </Button>
          </div>
        </form>
      )}
    </DangerZone>
  );
}
