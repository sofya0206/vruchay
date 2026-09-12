import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import type { Overview } from '../api/overview';
import { useMailingLog } from '../mailing/api';
import { formatLetterTime, mailListPath } from '../mailing/mail-lists';
import { StatusChip } from '../ui/Field';
import { Card, Empty, Rows } from './Block';
import { jobPercent, runningJobs, undelivered } from './desk';
import { jobLook } from './format';

const PROBLEMS_SHOWN = 3;
const REFRESH_MS = 5000;

/**
 * Что идёт прямо сейчас: выпуск и письма, которые не дошли.
 *
 * Единственное на главной, что меняется само, поэтому пока идёт выпуск,
 * сводка перечитывается каждые пять секунд. Счётчики писем отсюда ушли
 * в плитку «Письма доставлены»; здесь остаются только беды — то, на что
 * надо ответить, а не то, что можно посмотреть.
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

  return (
    <Card title="Сейчас идёт" to="/mailing" linkLabel="Все письма">
      {quiet ? (
        <Empty>Ничего не идёт. Выпуск и недошедшие письма появятся здесь сами.</Empty>
      ) : (
        <Rows>
          {jobs.map((job) => {
            const look = jobLook(job.status, job.failed);
            const percent = jobPercent(job);
            return (
              <li key={job.id} className="px-4 py-3">
                <div className="flex items-baseline gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {job.documentTitle}
                  </span>
                  <StatusChip tone={look.tone}>{look.label}</StatusChip>
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <div
                    role="progressbar"
                    aria-valuenow={percent}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`Выпуск «${job.documentTitle}»`}
                    className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--surface-sunken)]"
                  >
                    <div
                      className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-[var(--duration-base)]"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                  <span className="shrink-0 text-xs text-[var(--text-muted)] tabular-nums">
                    {job.done} из {job.total}
                  </span>
                </div>
              </li>
            );
          })}
          {problems.map((letter) => (
            <li key={letter.id}>
              <Link
                to={mailListPath('undelivered')}
                className="flex items-baseline gap-2 px-4 py-2.5 text-sm transition-colors hover:bg-[var(--surface-sunken)]"
              >
                <span aria-hidden className="size-1.5 shrink-0 translate-y-[-2px] rounded-full bg-[var(--danger)]" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{letter.toEmail}</span>
                  <span className="block truncate text-xs text-[var(--text-muted)]">
                    {letter.problem?.reason ?? 'Письмо не дошло'}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-[var(--text-muted)]">
                  {formatLetterTime(letter.sentAt ?? letter.queuedAt)}
                </span>
              </Link>
            </li>
          ))}
        </Rows>
      )}
    </Card>
  );
}
