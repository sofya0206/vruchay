import { Monitor, Moon, Sun, type LucideIcon } from 'lucide-react';
import { errorText } from '../api/client';
import { usePreferences, useUpdatePreferences, type DateFormat, type UiTheme } from '../api/org';
import { formatDate } from './preferences';
import { useTheme } from './theme';
import { ErrorBar } from '../ui/ErrorState';
import { OptionCard, OptionGroup } from '../ui/OptionCard';
import { SettingsSection, SettingsStack } from '../ui/Settings';

const THEMES: { value: UiTheme; title: string; about: string; icon: LucideIcon }[] = [
  { value: 'system', title: 'Как в системе', about: 'Следует за настройкой устройства', icon: Monitor },
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
 * Тема и формат дат.
 *
 * Настройка человека, а не организации: один и тот же сотрудник состоит
 * в нескольких, а глаза у него одни. Тема применяется сразу из стора,
 * без ожидания сервера: человек нажал — кабинет потемнел. На сервер
 * уходит следом, чтобы на другом компьютере кабинет открылся таким же.
 * Языка нет намеренно: интерфейс существует только по-русски.
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
    ? { on: update.variables?.theme !== undefined ? 'theme' : 'dateFormat', text: errorText(update.error) }
    : null;

  function chooseTheme(next: UiTheme) {
    setTheme(next);
    update.mutate({ theme: next });
  }

  return (
    <SettingsStack>
      <SettingsSection
        title="Тема"
        about="Как выглядит кабинет. Сам документ на любой теме остаётся белым — таким, каким его напечатают."
      >
        <OptionGroup label="Тема" columns={3}>
          {THEMES.map(({ value, title, about, icon }) => (
            <OptionCard
              key={value}
              icon={icon}
              title={title}
              description={about}
              selected={theme === value}
              onSelect={() => chooseTheme(value)}
            />
          ))}
        </OptionGroup>
        {failed?.on === 'theme' && <ErrorBar className="mt-3">{failed.text}</ErrorBar>}
      </SettingsSection>

      <SettingsSection
        title="Формат дат"
        about="Как показывать даты в кабинете — в списках, журналах и реестре. Дата на самом документе задаётся в макете и от этой настройки не зависит."
      >
        <OptionGroup label="Формат дат" columns={3}>
          {FORMATS.map((f) => (
            <OptionCard
              key={f}
              title={FORMAT_TITLE[f]}
              description={<span className="font-mono">{formatDate(sample, f)}</span>}
              selected={prefs.data.dateFormat === f}
              onSelect={() => update.mutate({ dateFormat: f })}
            />
          ))}
        </OptionGroup>
        {failed?.on === 'dateFormat' && <ErrorBar className="mt-3">{failed.text}</ErrorBar>}
      </SettingsSection>
    </SettingsStack>
  );
}
