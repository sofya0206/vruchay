import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Integrations } from '../settings/Integrations';

/**
 * Формы на сайте — отдельная страница, а не блок в настройках.
 *
 * Настройка формы идёт в два окна: наше и Тильда. Пока это был один блок
 * среди девяти, к нему приходилось прокручивать всю страницу настроек
 * после каждого переключения между окнами. Своя страница ещё и оставляет
 * место инструкции, которой в общем списке было не развернуться.
 */
export function IntegrationsPage() {
  return (
    <div className="min-h-full">
      <header className="border-b border-[var(--line)] bg-[var(--surface)]">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-6 py-3">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm text-[var(--text-muted)] hover:text-[var(--text)]"
          >
            <ArrowLeft size={16} />К материалам
          </Link>
          <span className="ml-auto font-serif text-lg">Формы на сайте</span>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8">
        <Integrations />
      </main>
    </div>
  );
}
