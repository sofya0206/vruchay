import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Overview } from '../api/overview';
import type { Summary } from '../api/analytics';
import { Sparkline } from '../analytics/DayChart';
import { DiscussTermsLink } from '../billing/DiscussTermsLink';
import { cn } from '../ui/cn';
import { usagePercent, usageTone } from './desk';
import { monthDelta, monthIn, plural } from './format';

/**
 * Четыре плитки сводки: остаток, выпуск за месяц, доставка писем, проверки.
 *
 * Не больше четырёх намеренно: пятая уже не читается с одного взгляда.
 * Цифра — первое, что видит глаз, подпись под ней приглушена, а сравнение
 * или полоса — одно на плитку, не то и другое.
 *
 * Цветом говорим только то, что требует действия: полоса остатка краснеет
 * по тому же порогу, по которому сервер откажет в выпуске; недошедшие
 * письма — красным числом. Всё остальное — чернильное.
 */
export function Metrics({
  data,
  summary,
  now = new Date(),
}: {
  data: Overview;
  /** Сводка за 30 дней — для линий и числа проверок; без неё плитки просто без линий. */
  summary?: Summary;
  now?: Date;
}) {
  const { usage } = data;
  const unlimited = usage.limit === null || usage.left === null;
  const tone = usageTone(usage);
  const delta = monthDelta(data.issuedMonth, data.issuedPrevMonth, now);
  const sent = data.emailsSent;
  const delivered = data.mail.delivered;
  const undelivered = data.mail.undelivered;
  const deliveredShare = sent > 0 ? Math.round((delivered / sent) * 100) : null;

  // `contents`: плитки встают прямо в сетку страницы, чтобы четвёртая
  // делила колонку с блоками справа, а не жила в своей отдельной сетке.
  return (
    <ul className="contents">
      <Tile
        label={usage.source === 'trial' ? 'Осталось на пробе' : 'Осталось по плану'}
        value={unlimited ? '∞' : (usage.left ?? 0)}
        unit={unlimited ? undefined : `из ${usage.limit}`}
        danger={tone === 'bad'}
        note={
          usage.expired ? (
            <>
              Срок плана закончился · выданные документы остаются действительными ·{' '}
              <DiscussTermsLink>обсудим продление</DiscussTermsLink>
            </>
          ) : (
            usage.planName
          )
        }
      >
        {!unlimited && (
          <div
            role="progressbar"
            aria-label="Израсходовано по плану"
            aria-valuenow={usagePercent(usage)}
            aria-valuemin={0}
            aria-valuemax={100}
            className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-sunken)]"
          >
            <div
              className={cn(
                'h-full rounded-full',
                tone === 'ok' && 'bg-[var(--ok)]',
                tone === 'warn' && 'bg-[var(--warn)]',
                tone === 'bad' && 'bg-[var(--danger)]',
              )}
              style={{ width: `${usagePercent(usage)}%` }}
            />
          </div>
        )}
      </Tile>

      <Tile
        label={`Выпущено ${monthIn(now)}`}
        value={data.issuedMonth}
        to="/registry?tab=analytics&period=30d"
        aside={summary && <Sparkline points={summary.issued.byDay} />}
        note={
          <span
            className={cn(
              delta.tone === 'up' && 'text-[var(--ok)]',
              delta.tone === 'down' && 'text-[var(--warn)]',
            )}
          >
            {delta.text}
          </span>
        }
      />

      <Tile
        label="Письма доставлены"
        value={deliveredShare === null ? '—' : deliveredShare}
        unit={deliveredShare === null ? undefined : '%'}
        note={
          sent === 0 ? (
            'Писем пока не было'
          ) : (
            <>
              {delivered} из {sent}
              {undelivered > 0 && (
                <>
                  {' '}
                  · <span className="text-[var(--danger)]">{undelivered} не дошло</span>
                </>
              )}
            </>
          )
        }
      />

      <Tile
        label="Проверки по QR"
        value={summary ? summary.checks.total : data.verifiedMonth}
        unit={
          summary
            ? plural(summary.checks.total, 'проверка', 'проверки', 'проверок')
            : plural(data.verifiedMonth, 'документ', 'документа', 'документов')
        }
        note={summary ? `за 30 дней · ${data.verificationsTotal} всего` : `за месяц · ${data.verificationsTotal} всего`}
        to="/registry?tab=analytics&period=30d"
        aside={summary && <Sparkline points={summary.checks.byDay} tone="ok" />}
      />
    </ul>
  );
}

function Tile({
  label,
  value,
  unit,
  note,
  danger = false,
  to,
  aside,
  children,
}: {
  label: string;
  value: number | string;
  unit?: string;
  note?: ReactNode;
  danger?: boolean;
  /** Куда ведёт плитка: в аналитику за тем же периодом. */
  to?: string;
  /** Линия за период в правом верхнем углу. */
  aside?: ReactNode;
  children?: ReactNode;
}) {
  const cls =
    'relative flex min-h-24 min-w-0 flex-col gap-1.5 self-stretch rounded-[var(--radius-card)] bg-[var(--surface)] px-3 pt-3 pb-2.5 shadow-[var(--ring-line)] sm:min-h-28 sm:px-4 sm:pt-3.5 sm:pb-3';
  const body = (
    <>
      {aside && <div className="absolute top-3 right-3 hidden sm:block">{aside}</div>}
      <p className="text-sm text-[var(--text-muted)]">{label}</p>
      <p className="flex items-baseline gap-1.5">
        <span
          className={cn(
            'text-2xl font-semibold leading-none tabular-nums sm:text-3xl',
            danger && 'text-[var(--danger)]',
          )}
        >
          {value}
        </span>
        {unit && <span className="text-sm text-[var(--text-muted)]">{unit}</span>}
      </p>
      {children}
      {note && <p className="mt-auto text-sm text-[var(--text-muted)]">{note}</p>}
    </>
  );
  if (to) {
    return (
      <li className="contents">
        <Link to={to} className={cn(cls, 'transition-colors hover:bg-[var(--row-hover)]')}>
          {body}
        </Link>
      </li>
    );
  }
  return <li className={cls}>{body}</li>;
}
