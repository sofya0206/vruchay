import { CalendarDays, Palette, Rows3 } from 'lucide-react';
import {
  usePreferences,
  useUpdatePreferences,
  type DateFormat,
  type UiDensity,
  type UiTheme,
} from '../api/org';
import { applyDensity, applyTheme, formatDate } from './preferences';

const THEMES: { value: UiTheme; title: string; hint: string }[] = [
  { value: 'system', title: 'Как в системе', hint: 'Меняется вместе с настройкой устройства' },
  { value: 'light', title: 'Светлая', hint: 'Всегда светлая, даже ночью' },
  { value: 'dark', title: 'Тёмная', hint: 'Всегда тёмная, даже днём' },
];

const FORMATS: DateFormat[] = ['numeric', 'long', 'iso'];

const DENSITIES: { value: UiDensity; title: string; hint: string }[] = [
  { value: 'comfortable', title: 'Обычная', hint: 'Просторные строки, легче читать' },
  { value: 'compact', title: 'Поджатая', hint: 'Больше строк на экране — для длинных реестров' },
];

const FORMAT_TITLE: Record<DateFormat, string> = {
  numeric: 'Числами',
  long: 'Прописью',
  iso: 'По стандарту',
};

/**
 * Тема и формат дат.
 *
 * Настройки человека, а не организации: один и тот же сотрудник состоит
 * в нескольких, а глаза у него одни. Тема применяется сразу, не дожидаясь
 * ответа сервера, — иначе выбор выглядит так, будто он не сработал.
 */
export function Interface() {
  const prefs = usePreferences();
  const update = useUpdatePreferences();
  const sample = new Date();

  function chooseTheme(theme: UiTheme) {
    applyTheme(theme);
    update.mutate({ theme });
  }

  // Плотность, как и тему, применяем сразу: иначе выбор выглядит
  // так, будто он не сработал.
  function chooseDensity(density: UiDensity) {
    applyDensity(density);
    update.mutate({ density });
  }

  if (!prefs.data) return null;

  return (
    <section className="space-y-8">
      <div>
        <h2 className="flex items-center gap-2 font-serif text-xl">
          <Palette size={18} className="text-[var(--accent)]" />
          Тема
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-[var(--text-muted)]">
          Как выглядит кабинет. На печатный лист не влияет: документ печатается на белом в любом
          случае.
        </p>

        <div className="mt-4 grid max-w-2xl gap-3 sm:grid-cols-3">
          {THEMES.map((t) => {
            const active = prefs.data.theme === t.value;
            return (
              <button
                key={t.value}
                type="button"
                onClick={() => chooseTheme(t.value)}
                aria-pressed={active}
                className={`rounded-2xl p-4 text-left ring-1 transition ${
                  active
                    ? 'bg-[var(--accent-soft)] ring-[var(--accent)]'
                    : 'bg-[var(--surface)] ring-[var(--line)] hover:ring-[var(--line-strong)]'
                }`}
              >
                <span className="block font-medium">{t.title}</span>
                <span className="mt-1 block text-sm text-[var(--text-muted)]">{t.hint}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <h2 className="flex items-center gap-2 font-serif text-xl">
          <CalendarDays size={18} className="text-[var(--accent)]" />
          Формат дат
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-[var(--text-muted)]">
          Как показывать даты в кабинете — в списках, журналах и реестре. Дата на самом документе
          задаётся в макете и от этой настройки не зависит.
        </p>

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
      </div>

      <div>
        <h2 className="flex items-center gap-2 font-serif text-xl">
          <Rows3 size={18} className="text-[var(--accent)]" />
          Плотность
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-[var(--text-muted)]">
          Насколько плотно идут строки в списках и таблицах. Размер текста не меняется — мельче
          он не станет.
        </p>

        <div className="mt-4 grid max-w-2xl gap-3 sm:grid-cols-2">
          {DENSITIES.map((d) => {
            const active = (prefs.data?.density ?? 'comfortable') === d.value;
            return (
              <button
                key={d.value}
                type="button"
                onClick={() => chooseDensity(d.value)}
                aria-pressed={active}
                className={`rounded-2xl p-4 text-left ring-1 transition ${
                  active
                    ? 'bg-[var(--accent-soft)] ring-[var(--accent)]'
                    : 'bg-[var(--surface)] ring-[var(--line)] hover:ring-[var(--line-strong)]'
                }`}
              >
                <span className="block font-medium">{d.title}</span>
                <span className="mt-1 block text-sm text-[var(--text-muted)]">{d.hint}</span>
              </button>
            );
          })}
        </div>

        {/*
          Языка здесь нет намеренно: интерфейс существует только по-русски,
          и переключатель обещал бы перевод, которого нет.
        */}
      </div>
    </section>
  );
}
