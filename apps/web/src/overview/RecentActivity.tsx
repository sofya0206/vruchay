import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import type { Overview } from '../api/overview';
import { StatusChip } from '../ui/Field';
import { formatWhen, jobLook } from './format';

/**
 * Последние мероприятия: материалы и задания на выпуск.
 *
 * Два списка рядом, потому что это разные вопросы: «над чем я работал»
 * и «чем закончился выпуск». Из первого выход в редактор, из второго —
 * в реестр выданного, где документ ищут по фамилии.
 */
export function RecentActivity({ data }: { data: Overview }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="min-w-0 rounded-2xl bg-[var(--surface)] p-4 ring-1 ring-[var(--line)]">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="font-medium">Материалы в работе</h2>
          <Link
            to="/documents"
            className="inline-flex items-center gap-1 text-sm text-[var(--text-muted)] hover:text-[var(--text)]"
          >
            Все материалы <ArrowRight size={14} />
          </Link>
        </div>

        {data.documents.length === 0 ? (
          <p className="py-6 text-center text-sm text-[var(--text-muted)]">Материалов пока нет</p>
        ) : (
          <ul className="divide-y divide-[var(--line)]">
            {data.documents.map((doc) => (
              <li key={doc.id}>
                <Link
                  to={`/documents/${doc.id}`}
                  className="-mx-2 flex items-baseline gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-[var(--surface-sunken)]"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{doc.title}</span>
                    {/* Название мероприятия важнее названия бланка: бланк
                        организации один на сезон, а мероприятий десятки. */}
                    {doc.eventName && (
                      <span className="block truncate text-sm text-[var(--text-muted)]">
                        {doc.eventName}
                        {doc.eventDate && ` · ${doc.eventDate}`}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-sm text-[var(--text-muted)]">
                    {formatWhen(doc.updatedAt)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="min-w-0 rounded-2xl bg-[var(--surface)] p-4 ring-1 ring-[var(--line)]">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="font-medium">Последние выпуски</h2>
          <Link
            to="/registry"
            className="inline-flex items-center gap-1 text-sm text-[var(--text-muted)] hover:text-[var(--text)]"
          >
            Реестр выданного <ArrowRight size={14} />
          </Link>
        </div>

        {data.jobs.length === 0 ? (
          <p className="py-6 text-center text-sm text-[var(--text-muted)]">
            Документы ещё не выпускались
          </p>
        ) : (
          <ul className="divide-y divide-[var(--line)]">
            {data.jobs.map((job) => {
              const look = jobLook(job.status, job.failed);
              return (
                <li key={job.id}>
                  <Link
                    to={`/registry?documentId=${job.documentId}`}
                    className="-mx-2 flex items-baseline gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-[var(--surface-sunken)]"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{job.documentTitle}</span>
                      <span className="block text-sm text-[var(--text-muted)]">
                        {job.done} из {job.total}
                        {job.failed > 0 && ` · не вышло ${job.failed}`} ·{' '}
                        {formatWhen(job.createdAt)}
                      </span>
                    </span>
                    <StatusChip tone={look.tone}>{look.label}</StatusChip>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
