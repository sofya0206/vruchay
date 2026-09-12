import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { INTEGRATION_SECTIONS } from './sections';
import { Card } from '../ui/Card';

/** Что здесь можно подключить — списком площадок с дорогой в каждую. */
const ABOUT: Record<string, string> = {
  tilda: 'Кнопка «Получить документ» на сайте, который управляется Тильдой.',
  'google-sheets': 'Документы выпускаются сами из строк таблицы.',
  telegram: 'Участник пишет боту имя или почту и получает документ.',
  link: 'Участник заполняет форму по ссылке и получает документ на почту.',
};

export function Info() {
  const platforms = INTEGRATION_SECTIONS.filter((s) => s.path !== 'info');

  return (
    <div className="space-y-6">
      <p className="max-w-2xl text-[var(--text-muted)]">
        Интеграция — это способ выдать документ без вашего участия: участник сам находит себя
        и получает свой файл, а выданное попадает в реестр как обычно.
      </p>

      <Card title="Что можно подключить">
        <ul className="divide-y divide-[var(--line)]">
          {platforms.map((s) => (
            <li key={s.path}>
              <Link
                to={`/integrations/${s.path}`}
                className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-[var(--surface-sunken)]"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)]">
                  <s.icon size={18} strokeWidth={1.75} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{s.title}</span>
                  <span className="block text-sm text-[var(--text-muted)]">{ABOUT[s.path]}</span>
                </span>
                <ArrowRight size={16} className="shrink-0 text-[var(--text-muted)]" />
              </Link>
            </li>
          ))}
        </ul>
      </Card>

      <p className="text-sm text-[var(--text-muted)]">
        Нужна помощь с подключением — напишите нам в{' '}
        <Link to="/settings/support" className="text-[var(--accent)] hover:underline">
          поддержку
        </Link>
        .
      </p>
    </div>
  );
}
