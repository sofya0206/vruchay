import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import type { Overview } from '../api/overview';
import { materialPath } from '../documents/material-steps';
import { useMailingLog } from '../mailing/api';
import { formatLetterTime, mailListPath } from '../mailing/mail-lists';
import { Card, Rows } from '../ui/Card';
import { StatusChip } from '../ui/Field';
import { ProgressBar } from '../ui/Progress';
import { lastJob, runningJobs, undelivered } from './desk';
import { formatWhen, jobLook } from './format';

const PROBLEMS_SHOWN = 3;
const RECENT_SHOWN = 3;
const REFRESH_MS = 5000;

/**
 * Что происходит: идущий выпуск, письма, которые не дошли, а в простое —
 * последние документы, чтобы продолжить с того места, где остановились.
 *
 * Единственное на главной, что меняется само, поэтому пока идёт выпуск,
 * сводка перечитывается каждые пять секунд. Счётчики писем живут в плитке
 * «Письма доставлены»; здесь только беды — то, на что надо ответить,
 * а не то, что можно посмотреть. Документы показываются только в простое:
 * рядом с идущим выпуском они отвлекали бы от него.
 */
export function Happening({ data }: { data: Overview }) {
  const qc = useQueryClient();
  const log = useMailingLog({ problemsOnly: false });
  const jobs = runningJobs(data.jobs);
  const problems = undelivered(log.data?.items ?? [], PROBLEMS_SHOWN);
  const running = jobs.length > 0;

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      void qc.invalidateQueries({ queryKey: ['overview'] });
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [running, qc]);

  const quiet = !running && problems.length === 0;
  const recent = quiet ? data.documents.slice(0, RECENT_SHOWN) : [];

  return (
    <Card padding="sm" title="Что происходит" to="/documents" linkLabel="Все документы">
      {quiet && recent.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">
          Ничего не идёт. Выпуск и недошедшие письма появятся здесь сами.
        </p>
      ) : (
        <Rows>
          {jobs.map((job) => (
            <li key={job.id} className="px-4 py-3">
              <ProgressBar
                label={job.documentTitle}
                done={job.done}
                total={job.total}
                failed={job.failed}
                running
              />
            </li>
          ))}
          {problems.map((letter) => (
            <li key={letter.id}>
              <Link
                to={mailListPath('undelivered')}
                className="flex items-baseline gap-2 px-4 py-2.5 text-sm transition-colors hover:bg-row-hover"
              >
                <span aria-hidden className="size-1.5 shrink-0 -translate-y-0.5 rounded-full bg-danger" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{letter.toEmail}</span>
                  <span className="block truncate text-xs text-muted">
                    {letter.problem?.reason ?? 'Письмо не дошло'}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-muted">
                  {formatLetterTime(letter.sentAt ?? letter.queuedAt)}
                </span>
              </Link>
            </li>
          ))}
          {recent.map((doc) => {
            const job = lastJob(doc.id, data.jobs);
            const look = job ? jobLook(job.status, job.failed) : null;
            return (
              <li key={doc.id}>
                <Link
                  to={materialPath(doc.id, 'sheet')}
                  className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-row-hover"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{doc.title}</span>
                    <span className="block truncate text-xs text-muted">
                      {doc.eventName ? `${doc.eventName} · ` : ''}
                      {formatWhen(doc.updatedAt)}
                    </span>
                  </span>
                  {look && <StatusChip tone={look.tone}>{look.label}</StatusChip>}
                  <span className="flex shrink-0 items-center gap-1 text-sm text-accent">
                    Продолжить
                    <ArrowRight size={16} aria-hidden />
                  </span>
                </Link>
              </li>
            );
          })}
        </Rows>
      )}
    </Card>
  );
}
