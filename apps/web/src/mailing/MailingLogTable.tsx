import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import type { DocumentSummary } from '../api/types';
import { Button } from '../ui/Button';
import { Select } from '../ui/Field';
import { useMailingLog, useResendFailed, type LogItem } from './api';
import { STATUS_LABELS, statusTone, undeliveredCount } from './letter-preview';

/**
 * Журнал доставки.
 *
 * Отвечает на единственный вопрос, ради которого сюда заходят: дошло ли
 * письмо и почему не дошло. Причина словами, а не кодом шлюза: «550 5.1.1»
 * не подсказывает, что делать, а «такого адреса не существует» — подсказывает.
 */
export function MailingLogTable({ documents }: { documents: DocumentSummary[] }) {
  const [documentId, setDocumentId] = useState('');
  const [problemsOnly, setProblemsOnly] = useState(false);

  const log = useMailingLog({ documentId: documentId || undefined, problemsOnly });
  const resend = useResendFailed();

  const undelivered = undeliveredCount(log.data?.summary ?? {});

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={documentId}
          onChange={(e) => setDocumentId(e.target.value)}
          className="max-w-xs"
          aria-label="Материал"
        >
          <option value="">Все материалы</option>
          {documents.map((doc) => (
            <option key={doc.id} value={doc.id}>
              {doc.title}
            </option>
          ))}
        </Select>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={problemsOnly}
            onChange={(e) => setProblemsOnly(e.target.checked)}
          />
          Только недоставленные
        </label>

        {/* Повторить можно только по одному материалу: «переотправить всё
            вообще» — это рассылка вслепую по всем прошлым выпускам. */}
        {documentId && undelivered > 0 && (
          <Button
            icon={<RefreshCw size={15} />}
            onClick={() => resend.mutate(documentId)}
            disabled={resend.isPending}
          >
            Отправить повторно всем недоставленным ({undelivered})
          </Button>
        )}
      </div>

      {resend.isSuccess && (
        <div className="rounded-xl bg-[var(--surface-sunken)] p-4 text-sm">
          <p>Поставлено в очередь заново: {resend.data.queued}</p>
          {resend.data.skipped.length > 0 && (
            <>
              <p className="mt-2 text-[var(--text-muted)]">
                Не повторяли — повтор ничего не изменит, адрес надо исправить в таблице:
              </p>
              <ul className="mt-1 space-y-1">
                {resend.data.skipped.map((item) => (
                  <li key={item.email}>
                    {item.email} — {item.reason}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {resend.isError && (
        <p className="text-sm text-[var(--danger)]">{(resend.error as Error).message}</p>
      )}

      {log.data && <Summary summary={log.data.summary} />}

      <div className="overflow-x-auto rounded-2xl ring-1 ring-[var(--line)]">
        <table className="w-full min-w-[46rem] text-sm">
          <thead className="bg-[var(--surface-sunken)] text-left text-[var(--text-muted)]">
            <tr>
              <th className="px-4 py-2 font-medium">Получатель</th>
              <th className="px-4 py-2 font-medium">Материал</th>
              <th className="px-4 py-2 font-medium">Письмо</th>
              <th className="px-4 py-2 font-medium">Состояние</th>
            </tr>
          </thead>
          <tbody>
            {log.data?.items.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-[var(--text-muted)]">
                  {problemsOnly ? 'Недоставленных писем нет' : 'Писем пока не было'}
                </td>
              </tr>
            )}
            {log.data?.items.map((item) => (
              <Row key={item.id} item={item} />
            ))}
          </tbody>
        </table>
      </div>

      {(log.data?.items.length ?? 0) >= 200 && (
        <p className="text-sm text-[var(--text-muted)]">
          Показаны последние 200 писем. Выберите материал, чтобы увидеть его целиком.
        </p>
      )}
    </div>
  );
}

function Row({ item }: { item: LogItem }) {
  const tone = statusTone(item.status);
  const colors = {
    neutral: 'bg-[var(--surface-sunken)] text-[var(--text-muted)]',
    progress: 'bg-[var(--award-soft)] text-[var(--award)]',
    done: 'bg-[var(--accent-soft)] text-[var(--accent)]',
    danger: 'bg-[var(--danger-soft)] text-[var(--danger)]',
  } as const;

  return (
    <tr className="border-t border-[var(--line)] align-top">
      <td className="px-4 py-2">{item.toEmail}</td>
      <td className="px-4 py-2 text-[var(--text-muted)]">{item.documentTitle}</td>
      <td className="px-4 py-2">
        <span className="block">{item.subject}</span>
        {item.kind === 'marketing' && (
          <span className="text-xs text-[var(--text-muted)]">реклама</span>
        )}
      </td>
      <td className="px-4 py-2">
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${colors[tone]}`}
        >
          {STATUS_LABELS[item.status]}
        </span>
        {item.problem && (
          <>
            <p className="mt-1 text-[var(--text)]">{item.problem.reason}</p>
            {item.problem.details && (
              // Ответ шлюза нужен поддержке, а не человеку: под спойлером,
              // чтобы не мешал читать понятную причину.
              <details className="mt-1">
                <summary className="cursor-pointer text-xs text-[var(--text-muted)]">
                  Ответ почтового сервера
                </summary>
                <p className="mt-1 font-mono text-xs break-words text-[var(--text-muted)]">
                  {item.problem.details}
                </p>
              </details>
            )}
          </>
        )}
      </td>
    </tr>
  );
}

function Summary({ summary }: { summary: Partial<Record<LogItem['status'], number>> }) {
  // Отказ шлюза и отказ ящика получателя — для человека одно и то же
  // «не доставлено», поэтому в сводке они складываются, а не идут
  // двумя одинаковыми строчками.
  const counts: [string, number][] = [
    ['в очереди', summary.queued ?? 0],
    ['отправлено', summary.sent ?? 0],
    ['доставлено', summary.delivered ?? 0],
    ['прочитано', summary.opened ?? 0],
    ['не доставлено', undeliveredCount(summary)],
  ];
  const shown = counts.filter(([, value]) => value > 0);
  if (shown.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-[var(--text-muted)]">
      {shown.map(([label, value]) => (
        <span key={label}>
          {label}: <b className="text-[var(--text)]">{value}</b>
        </span>
      ))}
    </div>
  );
}
