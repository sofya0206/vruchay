import { useState } from 'react';
import { Check, KeyRound } from 'lucide-react';
import { useTeamMutations } from '../api/team';
import { Button } from '../ui/Button';
import { Input, Label } from '../ui/Field';

/**
 * Смена собственного пароля.
 *
 * Нынешний пароль спрашивается не для формальности: без него любая
 * оставленная открытой сессия — на общем компьютере в спортшколе это
 * обычное дело — позволяет захватить учётную запись насовсем.
 */
export function ChangePassword() {
  const { changePassword } = useTeamMutations();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [done, setDone] = useState(false);

  const mismatch = repeat.length > 0 && next !== repeat;
  const ready = current.length > 0 && next.length > 0 && !mismatch;

  return (
    <section>
      <h2 className="font-serif text-xl">Пароль</h2>
      <p className="mt-1 max-w-2xl text-sm text-[var(--text-muted)]">
        Меняйте, если пароль кто-то узнал или вы вводили его на чужом компьютере.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          changePassword.mutate(
            { current, next },
            {
              onSuccess: () => {
                setDone(true);
                setCurrent('');
                setNext('');
                setRepeat('');
                setTimeout(() => setDone(false), 4000);
              },
            },
          );
        }}
        className="mt-4 max-w-md space-y-4 rounded-2xl bg-[var(--surface)] p-4 ring-1 ring-[var(--line)]"
      >
        <div>
          <Label>Нынешний пароль</Label>
          <Input
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </div>

        <div>
          <Label>Новый пароль</Label>
          <Input
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
          <p className="mt-1.5 text-sm text-[var(--text-muted)]">
            Не короче 10 знаков, хотя бы одна буква и одна цифра.
          </p>
        </div>

        <div>
          <Label>Новый пароль ещё раз</Label>
          <Input
            type="password"
            autoComplete="new-password"
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
          />
          {mismatch && <p className="mt-1.5 text-sm text-[var(--danger)]">Пароли не совпадают</p>}
        </div>

        {changePassword.isError && (
          <p role="alert" className="text-sm text-[var(--danger)]">
            {(changePassword.error as Error).message}
          </p>
        )}

        <div className="flex items-center gap-3">
          <Button
            type="submit"
            variant="primary"
            icon={<KeyRound size={15} />}
            disabled={!ready || changePassword.isPending}
          >
            {changePassword.isPending ? 'Меняем…' : 'Сменить пароль'}
          </Button>
          {done && (
            <span className="flex items-center gap-1.5 text-sm text-[var(--accent)]">
              <Check size={15} /> Пароль изменён
            </span>
          )}
        </div>
      </form>
    </section>
  );
}
