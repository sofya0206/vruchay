import { useState } from 'react';
import { Check } from 'lucide-react';
import { useTeamMutations } from '../api/team';
import { Button } from '../ui/Button';
import { Field, Input } from '../ui/Field';
import { errorText } from '../api/client';
import { SettingRow, SettingRows, SettingsSection } from '../ui/Settings';

/**
 * Смена собственного пароля.
 *
 * Нынешний пароль спрашивается не для формальности: без него любая
 * оставленная открытой сессия — на общем рабочем компьютере это
 * обычное дело — позволяет захватить учётную запись насовсем.
 *
 * Форма раскрывается по кнопке: три пустых поля пароля на каждом
 * открытии настроек — шум, а меняют пароль раз в год.
 */
export function ChangePassword() {
  const { changePassword } = useTeamMutations();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [done, setDone] = useState(false);

  const mismatch = repeat.length > 0 && next !== repeat;
  const ready = current.length > 0 && next.length > 0 && !mismatch;

  const reset = () => {
    setCurrent('');
    setNext('');
    setRepeat('');
  };

  return (
    <SettingsSection title="Вход">
      <SettingRows>
        <SettingRow
          title="Пароль"
          about="Меняйте, если его кто-то узнал или вы вводили его на чужом компьютере"
        >
          {done && (
            <span className="flex items-center gap-1.5 text-sm text-ok">
              <Check size={15} /> Изменён
            </span>
          )}
          {!open && (
            <Button size="sm" onClick={() => setOpen(true)}>
              Сменить
            </Button>
          )}
        </SettingRow>
        {open && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              changePassword.mutate(
                { current, next },
                {
                  onSuccess: () => {
                    setDone(true);
                    reset();
                    setOpen(false);
                    setTimeout(() => setDone(false), 4000);
                  },
                },
              );
            }}
            className="max-w-sm space-y-4 py-4"
          >
            <Field label="Нынешний пароль">
              <Input
                type="password"
                autoComplete="current-password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                autoFocus
              />
            </Field>
            <Field label="Новый пароль" help="Не короче 10 знаков, хотя бы одна буква и одна цифра">
              <Input
                type="password"
                autoComplete="new-password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
              />
            </Field>
            <Field label="Новый пароль ещё раз" error={mismatch ? 'Пароли не совпадают' : undefined}>
              <Input
                type="password"
                autoComplete="new-password"
                value={repeat}
                onChange={(e) => setRepeat(e.target.value)}
              />
            </Field>

            {changePassword.isError && (
              <p role="alert" className="text-sm text-danger">
                {errorText(changePassword.error)}
              </p>
            )}

            <div className="flex items-center gap-2">
              <Button
                type="submit"
                size="sm"
                variant="primary"
                disabled={!ready || changePassword.isPending}
              >
                {changePassword.isPending ? 'Меняем…' : 'Сменить пароль'}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  reset();
                  setOpen(false);
                }}
              >
                Отмена
              </Button>
            </div>
          </form>
        )}
      </SettingRows>
    </SettingsSection>
  );
}
