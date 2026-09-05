import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { DiscussTerms } from '../landing/DiscussTerms';
import { Meta } from '../seo/Meta';

/**
 * Форма «Обсудить условия» по собственному адресу.
 *
 * Раньше из кабинета вели на якорь главной — `/#obsudit`. Для вошедшего
 * человека главная это его «Обзор», а не рассказ о сервисе: якорь никуда
 * не приводил, и упёршийся в исчерпанный план попадал на свой же дашборд.
 * Заявку в этот момент оставить было негде — при том что оставить её
 * и есть единственный выход из тупика.
 *
 * Поэтому страница живёт отдельно и стоит в обеих ветках маршрутизации,
 * до входа и после: адрес у формы один и тот же независимо от сессии.
 * На главной секция с той же формой остаётся — посетитель доходит до неё
 * прокруткой, и отправлять его на отдельную страницу незачем.
 */
export function DiscussTermsPage() {
  return (
    <>
      <Meta
        title="Обсудить условия — Вручай"
        description="Расскажите, сколько документов вы выдаёте и к какому мероприятию нужно успеть, — вернёмся с условиями под ваш объём."
        path="/obsudit"
      />

      <div className="min-h-full bg-[var(--ground)]">
        <header className="border-b border-[var(--line)] bg-[var(--surface)]">
          <div className="mx-auto flex max-w-3xl items-center gap-3 px-6 py-3">
            <Link
              to="/"
              className="inline-flex items-center gap-2 text-sm text-[var(--text-muted)] hover:text-[var(--text)]"
            >
              <ArrowLeft size={16} />
              Вручай
            </Link>
          </div>
        </header>

        <DiscussTerms />
      </div>
    </>
  );
}
