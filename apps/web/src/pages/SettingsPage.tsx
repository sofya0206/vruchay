import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { MailDomains } from '../settings/MailDomains';
import { Integrations } from '../settings/Integrations';

/** Настройки организации: отправка писем и приём заявок с сайта. */
export function SettingsPage() {
  return (
    <div className="min-h-full">
      <header className="border-b border-[var(--line)] bg-[var(--surface)]">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-6 py-3">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm text-[var(--text-muted)] hover:text-[var(--text)]"
          >
            <ArrowLeft size={16} />К документам
          </Link>
          <span className="ml-auto font-serif text-lg">Настройки</span>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-10 px-6 py-8">
        <MailDomains />
        <hr className="border-[var(--line)]" />
        <Integrations />
      </main>
    </div>
  );
}
