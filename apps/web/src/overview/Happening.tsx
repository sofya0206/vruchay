import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import type { Overview } from '../api/overview';
import { useMailingLog } from '../mailing/api';
import { formatLetterTime, listCount, mailListPath, type MailList } from '../mailing/mail-lists';
import { StatusChip } from '../ui/Field';
import { Block, Empty, Rows } from './Block';
import { jobPercent, runningJobs, undelivered } from './desk';
import { jobLook } from './format';

/** Сколько недоставленных показать на главной. Остальные — в разделе писем. */
const PROBLEMS_SHOWN = 3;

/** Как часто перепроверять идущий выпуск — тот же шаг, что у журнала писем. */
const REFRESH_MS = 5000;

/**
 * Второй блок полосы: что происходит прямо сейчас.
 *
 * Человек, который только что нажал «Выпустить» или разослал письма,
 * возвращается на главную с одним вопросом — дошло ли. Раньше ответ
 * лежал в двух разных разделах, и половину пути он проделывал, чтобы
 * убедиться, что всё в порядке.
 *
 * Отказы стоят рядом с очередью, а не отдельной страницей «ошибки»:
 * недоставленное письмо — это не сбой сервиса, а обычная часть рассылки,
 * которую надо увидеть в тот же день, а не через неделю.
 */
export function Happening({ data }: { data: Overview }) {
  const qc = useQueryClient();
  const log = useMailingLog({ problemsOnly: false });

  const jobs = runningJobs(data.jobs);
  const summary = log.data?.summary ?? {};
  const problems = undelivered(log.data?.items ?? [], PROBLEMS_SHOWN);
  const letters = listCount('all', summary);

  /*
   * Пока выпуск идёт, сводку перечитываем сами.
   *
   * Журнал писем обновляется сам, а сводка — нет: она общая для всего
   * кабинета, и заставлять её опрашивать сервер всегда значит держать
   * запрос ради страницы, на которой обычно ничего не происходит.
   * Поэтому опрашиваем ровно столько, сколько идёт выпуск.
   */
  const running = jobs.length > 0;
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      void qc.invalidateQueries({ queryKey: ['overview'] });
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [running, qc]);

  const quiet = !running && letters === 0;

  return (
    <Block
      title="Сейчас происходит"
      about="Выпуск документов и судьба писем — по мере того как они уходят."
      to="/mailing"
      linkLabel="Все письма"
    >
      {quiet ? (
        <Empty>
          Пока ничего не идёт. Здесь появятся выпуск документов и письма —
          сразу, как только вы их запустите.
        </Empty>
      ) : (
        <div className="grid gap-4">
          {running && (
            <Rows>
              {jobs.map((job) => {
                const look = jobLook(job.status, job.failed);
                const percent = jobPercent(job);

                return (
                  <li key={job.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                      <span className="min-w-0 flex-1 truncate font-medium">
                        {job.documentTitle}
                      </span>
                      <StatusChip tone={look.tone}>{look.label}</StatusChip>
                      <span className="shrink-0 text-sm tabular-nums text-[var(--text-muted)]">
                        {job.done} из {job.total}
                      </span>
                    </div>
                    {/* Полоса, а не одни цифры: на трёхстах строках разница
                        между «встало» и «идёт» видна только движением. */}
                    <div
                      role="progressbar"
                      aria-valuenow={percent}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`Выпуск «${job.documentTitle}»`}
                      className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--surface-sunken)]"
                    >
                      <div
                        className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-[var(--duration-base)]"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </Rows>
          )}

          {letters > 0 && (
            <ul className="flex flex-wrap gap-3">
              <Counter id="queued" label="В очереди" summary={summary} />
              <Counter id="delivered" label="Доставлено" summary={summary} />
              <Counter id="undelivered" label="Не доставлено" summary={summary} danger />
            </ul>
          )}

          {problems.length > 0 && (
            <Rows>
              {problems.map((letter) => (
                <li key={letter.id}>
                  <Link
                    to={mailListPath('undelivered')}
                    className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-4 py-3 transition-colors hover:bg-[var(--accent-soft)]"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{letter.toEmail}</span>
                      <span className="mt-0.5 block truncate text-sm text-[var(--text-muted)]">
                        {/* Причину отказа берём ту же, что в журнале: человек
                            должен прочитать «ящик не существует», а не код. */}
                        {letter.problem?.reason ?? 'Письмо не дошло'} · {letter.documentTitle}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm text-[var(--text-muted)]">
                      {formatLetterTime(letter.queuedAt)}
                    </span>
                  </Link>
                </li>
              ))}
            </Rows>
          )}
        </div>
      )}
    </Block>
  );
}

/**
 * Число писем в состоянии — ссылкой в ту же папку раздела.
 *
 * Считает тот же код, что рисует папки в разделе писем: цифра на главной
 * и цифра рядом с папкой не имеют права разойтись.
 */
function Counter({
  id,
  label,
  summary,
  danger = false,
}: {
  id: MailList;
  label: string;
  summary: Parameters<typeof listCount>[1];
  danger?: boolean;
}) {
  const count = listCount(id, summary);

  return (
    <li>
      <Link
        to={mailListPath(id)}
        className="block min-w-36 rounded-[var(--radius-card)] bg-[var(--surface)] px-4 py-3 shadow-[var(--ring-line)] transition-colors hover:bg-[var(--accent-soft)]"
      >
        <span
          className={`block text-2xl font-semibold tabular-nums ${
            danger && count > 0 ? 'text-[var(--danger)]' : ''
          }`}
        >
          {count}
        </span>
        <span className="mt-0.5 block text-sm text-[var(--text-muted)]">{label}</span>
      </Link>
    </li>
  );
}
