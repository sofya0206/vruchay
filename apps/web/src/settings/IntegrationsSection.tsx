import { useState } from 'react';
import { ChevronDown, Link2, Send, Sheet } from 'lucide-react';
import { Tilda } from '../integrations/Tilda';
import { Button } from '../ui/Button';
import { Collapse } from '../ui/Collapse';
import { Rows } from '../ui/Card';
import { SettingsSection, SettingsStack } from '../ui/Settings';
import { cn } from '../ui/cn';
import { ApiTokens } from './ApiTokens';

/*
 * Площадки, у которых ещё нет серверной части. Раньше стояли пунктами
 * меню наравне с Тильдой, и три из четырёх «интеграций» открывали
 * заглушку. Теперь — одной строкой «скоро» под настоящей.
 */
const SOON = [
  { icon: Sheet, title: 'Google Таблицы', about: 'Документы выпускаются сами, по мере того как в таблицу добавляются строки.' },
  { icon: Send, title: 'Бот в Telegram', about: 'Участник пишет боту имя или почту и получает документ, не заходя на сайт.' },
  { icon: Link2, title: 'Форма по ссылке', about: 'Участник заполняет пустые поля документа и получает его на почту.' },
];

/**
 * Интеграции и API — настройка организации, а не раздел меню.
 *
 * Работающее подключение одно — форма на сайте (Tilda); токены API —
 * для тех, кто встраивает выдачу в свои процессы. Обе вещи настраивает
 * один и тот же человек, и живут они рядом.
 */
export function IntegrationsSection() {
  const [soon, setSoon] = useState(false);

  return (
    <SettingsStack>
      <SettingsSection
        title="Форма на сайте"
        about="Кнопка «Получить документ» на сайте, который управляется Тильдой: участник сам находит себя и получает файл."
      >
        <Tilda heading={false} />
      </SettingsSection>

      <div id="api">
        <ApiTokens />
      </div>

      <SettingsSection
        title="Другие способы"
        about="Готовятся. Напишите в поддержку, если какой-то из них нужен вам первым — расскажем, когда появится."
        action={
          <Button variant="ghost" size="sm" onClick={() => setSoon((v) => !v)} aria-expanded={soon}>
            {soon ? 'Скрыть' : 'Показать'}
            <ChevronDown size={16} className={cn('transition-transform', soon && 'rotate-180')} aria-hidden />
          </Button>
        }
      >
        <Collapse open={soon}>
          <Rows>
            {SOON.map((s) => (
              <li key={s.title} className="flex items-start gap-3 px-4 py-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-control bg-sunken text-muted">
                  <s.icon size={18} strokeWidth={1.75} aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{s.title}</span>
                  <span className="block text-sm text-muted">{s.about}</span>
                </span>
                <span className="ml-auto shrink-0 text-xs text-muted">скоро</span>
              </li>
            ))}
          </Rows>
        </Collapse>
      </SettingsSection>
    </SettingsStack>
  );
}
