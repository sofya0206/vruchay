import { Link } from 'react-router-dom';
import { FileText } from 'lucide-react';
import type { Overview } from '../api/overview';
import { StatusChip } from '../ui/Field';
import { Card } from '../ui/Card';
import { lastJob } from './desk';
import { formatWhen, jobLook } from './format';

/** Сколько последних документов показать. Остальные — в разделе. */
const SHOWN = 4;

/**
 * Последние документы — карточками, по одной на материал.
 *
 * Состояние показываем только там, где оно известно: сервер присылает
 * пять последних заданий по организации, и у давнего материала задания
 * среди них нет (см. `lastJob`).
 */
export function MyDocuments({ data }: { data: Overview }) {
  const docs = data.documents.slice(0, SHOWN);

  return (
    <Card title="Последние документы" to="/documents" linkLabel="Все документы">
      {docs.length === 0 ? (
        <p className="rounded-xl bg-[var(--surface-sunken)] px-4 py-8 text-center text-sm text-[var(--text-muted)]">
          Пока нет документов. Нажмите «Создать документ» — и он появится здесь.
        </p>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
          {docs.map((doc) => {
            const job = lastJob(doc.id, data.jobs);
            const look = job ? jobLook(job.status, job.failed) : null;

            return (
              <li key={doc.id}>
                <Link
                  to={`/documents/${doc.id}`}
                  className="flex h-full flex-col gap-3 hairline rounded-xl p-4 transition-colors hover:bg-[var(--accent-soft)]"
                >
                  <span className="grid size-10 place-items-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)]">
                    <FileText size={20} strokeWidth={1.75} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 font-medium">{doc.title}</span>
                    {/* Название мероприятия важнее названия бланка: бланк
                        организации один на сезон, а мероприятий десятки. */}
                    {doc.eventName && (
                      <span className="mt-0.5 block truncate text-sm text-[var(--text-muted)]">
                        {doc.eventName}
                        {doc.eventDate && ` · ${doc.eventDate}`}
                      </span>
                    )}
                  </span>
                  <span className="flex items-center justify-between gap-2 text-sm text-[var(--text-muted)]">
                    <span>{formatWhen(doc.updatedAt)}</span>
                    {look && <StatusChip tone={look.tone}>{look.label}</StatusChip>}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
