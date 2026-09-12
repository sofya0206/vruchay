import { CalendarDays } from 'lucide-react';
import { usePreferences, useUpdatePreferences, type DateFormat } from '../api/org';
import { formatDate } from './preferences';

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
 * Темы и плотности здесь больше нет: тёмной палитры у кабинета нет,
 * а переключатель, который ничего не меняет, хуже его отсутствия.
 * Языка тоже нет намеренно: интерфейс существует только по-русски.
 */
export function Interface() {
  const prefs = usePreferences();
  const update = useUpdatePreferences();
  const sample = new Date();

  if (!prefs.data) return null;

  return (
    <section>
      <h2 className="flex items-center gap-2 text-lg font-medium">
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
    </section>
  );
}
