import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { MailDomains } from '../settings/MailDomains';
import { Team } from '../settings/Team';
import { ChangePassword } from '../settings/ChangePassword';
import { Organization } from '../settings/Organization';
import { InviteFriend } from '../settings/InviteFriend';
import { Review } from '../settings/Review';
import { AuditLog } from '../settings/AuditLog';
import { ApiTokens } from '../settings/ApiTokens';

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
            <ArrowLeft size={16} />К материалам
          </Link>
          <span className="ml-auto font-serif text-lg">Настройки</span>
        </div>
      </header>

      {/* Сотрудники первыми: это нужно каждой организации, а домены
          и приём заявок с сайта — только тем, кто до них дорос. */}
      <main className="mx-auto max-w-4xl space-y-10 px-6 py-8">
        <Organization />
        <hr className="border-[var(--line)]" />
        <InviteFriend />
        <hr className="border-[var(--line)]" />
        <Review />
        <hr className="border-[var(--line)]" />
        <Team />
        <hr className="border-[var(--line)]" />
        <ChangePassword />
        <hr className="border-[var(--line)]" />
        <MailDomains />
        <hr className="border-[var(--line)]" />
        {/* Сама настройка переехала на свою страницу: она идёт в два окна
            и требует места под инструкцию. Здесь остаётся указатель — иначе
            тот, кто привык искать её тут, решит, что возможность убрали. */}
        <section>
          <h2 className="font-serif text-xl">Выдача документов на сайте</h2>
          <p className="mt-1 max-w-2xl text-sm text-[var(--text-muted)]">
            Кнопка «Получить документ» на вашей странице: участник проверяет свои данные
            и получает именной документ на почту.
          </p>
          <Link
            to="/integrations"
            className="mt-3 inline-flex items-center gap-2 text-sm text-[var(--accent)] hover:underline"
          >
            Настроить формы на сайте
            <ArrowRight size={16} />
          </Link>
        </section>
        {/* Журнал и токены последними: нужны редко и не всем, а место
            наверху занимает то, чем пользуются каждый день. */}
        <hr className="border-[var(--line)]" />
        <AuditLog />
        <hr className="border-[var(--line)]" />
        <ApiTokens />
      </main>
    </div>
  );
}
