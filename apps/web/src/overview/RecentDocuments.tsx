import { Link } from 'react-router-dom';
import type { Overview } from '../api/overview';
import { StatusChip } from '../ui/Field';
import { Card, Empty, Rows } from './Block';
import { lastJob } from './desk';
import { formatWhen, jobLook } from './format';

/**
 * Последнее, над чем работали. Нажатие открывает лист.
 *
 * Пять строк, не сетка карточек: на главной документы — вторая колонка,
 * а не главное. За сеткой и папками — раздел «Документы».
 */
export function RecentDocuments({ data }: { data: Overview }) {
  return (
    <Card title="Документы" to="/documents" linkLabel="Все документы">
      {data.documents.length === 0 ? (
        <Empty>Документов пока нет. Начните с кнопки «Создать документ».</Empty>
      ) : (
        <Rows>
          {data.documents.map((doc) => {
            const job = lastJob(doc.id, data.jobs);
            const look = job ? jobLook(job.status, job.failed) : null;
            return (
              <li key={doc.id}>
                <Link
                  to={`/documents/${doc.id}`}
                  className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-[var(--surface-sunken)]"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{doc.title}</span>
                    <span className="block truncate text-xs text-[var(--text-muted)]">
                      {doc.eventName ? `${doc.eventName} · ` : ''}
                      {formatWhen(doc.updatedAt)}
                    </span>
                  </span>
                  {look && <StatusChip tone={look.tone}>{look.label}</StatusChip>}
                </Link>
              </li>
            );
          })}
        </Rows>
      )}
    </Card>
  );
}
