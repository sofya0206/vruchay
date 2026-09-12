import type { ReactNode } from 'react';
import type { Overview } from '../api/overview';
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
export function Metrics({ data, now = new Date() }: { data: Overview; now?: Date }) {
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
        label="Проверяли по QR за месяц"
        value={data.verifiedMonth}
        unit={plural(data.verifiedMonth, 'документ', 'документа', 'документов')}
        note={`${data.verificationsTotal} ${plural(data.verificationsTotal, 'проверка', 'проверки', 'проверок')} за всё время`}
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
  children,
}: {
  label: string;
  value: number | string;
  unit?: string;
  note?: ReactNode;
  danger?: boolean;
  children?: ReactNode;
}) {
  return (
    <li className="flex min-h-28 flex-col gap-1.5 rounded-[var(--radius-card)] bg-[var(--surface)] px-4 pt-3.5 pb-3 shadow-[var(--ring-line)]">
      <p className="text-sm text-[var(--text-muted)]">{label}</p>
      <p className="flex items-baseline gap-1.5">
        <span
          className={cn(
            'text-3xl font-semibold leading-none tabular-nums',
            danger && 'text-[var(--danger)]',
          )}
        >
          {value}
        </span>
        {unit && <span className="text-sm text-[var(--text-muted)]">{unit}</span>}
      </p>
      {children}
      {note && <p className="mt-auto text-sm text-[var(--text-muted)]">{note}</p>}
    </li>
  );
}
