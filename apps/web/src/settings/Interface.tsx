import { Monitor, Moon, Sun, type LucideIcon } from 'lucide-react';
import { errorText } from '../api/client';
import { usePreferences, useUpdatePreferences, type DateFormat, type UiTheme } from '../api/org';
import { formatDate } from './preferences';
import { useTheme } from './theme';
import { SectionHead } from '../ui/Settings';

const THEMES: { value: UiTheme; title: string; about: string; icon: LucideIcon }[] = [
  {
    value: 'system',
    title: 'Как в системе',
    about: 'Следует за настройкой устройства',
    icon: Monitor,
  },
  { value: 'light', title: 'Светлая', about: 'Белый кабинет в любое время', icon: Sun },
  { value: 'dark', title: 'Тёмная', about: 'Ночь в кабинете, свет на листе', icon: Moon },
];

const FORMATS: DateFormat[] = ['numeric', 'long', 'iso'];

const FORMAT_TITLE: Record<DateFormat, string> = {
  numeric: 'Числами',
  long: 'Прописью',
  iso: 'По стандарту',
};

/**
 * Формат дат.
 *
 * Настройка человека, а не организации: один и тот же сотрудник состоит
 * в нескольких, а глаза у него одни.
 *
 * Тема применяется сразу из стора, без ожидания сервера: человек
 * нажал — кабинет потемнел. На сервер уходит следом, чтобы на другом
 * компьютере кабинет открылся таким же.
 *
 * Плотности здесь нет. Языка тоже нет намеренно: интерфейс существует
 * только по-русски.
 */
export function Interface() {
  const prefs = usePreferences();
  const update = useUpdatePreferences();
  const { theme, setTheme } = useTheme();
  const sample = new Date();

  if (!prefs.data) return null;

  /*
   * Отказ показываем под той частью, где выбирали. Тема при этом остаётся
   * выбранной на этом устройстве, но сервер её не знает — и при следующем
   * входе вернул бы прежнюю молча, будто выбор не состоялся.
   */
  const failed = update.isError
    ? {
        on: update.variables?.theme !== undefined ? 'theme' : 'dateFormat',
        text: errorText(update.error),
      }
    : null;

  function chooseTheme(next: UiTheme) {
    setTheme(next);
    update.mutate({ theme: next });
  }

  return (
    <section className="space-y-10">
      <div>
        <SectionHead title="Тема" about={<>Как выглядит кабинет. Сам документ на любой теме остаётся белым — таким, каким его напечатают.</>} />

        <div
          className="mt-4 grid max-w-2xl gap-3 sm:grid-cols-3"
          role="radiogroup"
          aria-label="Тема"
        >
          {THEMES.map(({ value, title, about, icon: Icon }) => {
            const active = theme === value;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => chooseTheme(value)}
                className={`rounded-2xl p-4 text-left ring-1 transition ${
                  active
                    ? 'bg-[var(--accent-soft)] ring-[var(--accent)]'
                    : 'bg-[var(--surface)] ring-[var(--line)] hover:ring-[var(--line-strong)]'
                }`}
              >
                <Icon
                  size={18}
                  className={active ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'}
                />
                <span className="mt-2 block font-medium">{title}</span>
                <span className="mt-0.5 block text-sm text-[var(--text-muted)]">{about}</span>
              </button>
            );
          })}
        </div>
        {failed?.on === 'theme' && (
          <p role="alert" className="mt-2 text-sm text-[var(--danger)]">
            {failed.text}
          </p>
        )}
      </div>

      <div>
        <SectionHead title="Формат дат" about={<>Как показывать даты в кабинете — в списках, журналах и реестре. Дата на самом документе задаётся в макете и от этой настройки не зависит.</>} />

        <div className="mt-4 grid max-w-2xl gap-3 sm:grid-cols-3">
          {FORMATS.map((f) => {
            const active = prefs.data.dateFormat === f;
            return (
              <button
                key={f}
                type="button"
                onClick={() => update.mutate({ dateFormat: f })}
                aria-pressed={active}
                className={`rounded-2xl p-4 text-left ring-1 transition ${
                  active
                    ? 'bg-[var(--accent-soft)] ring-[var(--accent)]'
                    : 'bg-[var(--surface)] ring-[var(--line)] hover:ring-[var(--line-strong)]'
                }`}
              >
                <span className="block font-medium">{FORMAT_TITLE[f]}</span>
                <span className="mt-1 block font-mono text-sm text-[var(--text-muted)]">
                  {formatDate(sample, f)}
                </span>
              </button>
            );
          })}
        </div>
        {failed?.on === 'dateFormat' && (
          <p role="alert" className="mt-2 text-sm text-[var(--danger)]">
            {failed.text}
          </p>
        )}
      </div>
    </section>
  );
}
