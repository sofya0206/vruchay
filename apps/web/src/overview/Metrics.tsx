import type { Overview } from '../api/overview';
import type { Summary } from '../api/analytics';
import { Sparkline } from '../analytics/DayChart';
import { DiscussTermsLink } from '../billing/DiscussTermsLink';
import { Stat } from '../ui/Stat';
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
 *
 * Плитки встают прямо в сетку страницы, чтобы четвёртая делила колонку
 * с блоком справа, а не жила в своей отдельной сетке.
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

  return (
    <>
      <Stat
        label={usage.source === 'trial' ? 'Осталось на пробе' : 'Осталось по плану'}
        value={unlimited ? '∞' : (usage.left ?? 0)}
        unit={unlimited ? undefined : `из ${usage.limit}`}
        tone={tone === 'bad' ? 'danger' : 'default'}
        hint={
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
            className="h-1 overflow-hidden rounded-full bg-sunken"
          >
            <div
              className={cn(
                'h-full rounded-full',
                tone === 'ok' && 'bg-ok',
                tone === 'warn' && 'bg-warn',
                tone === 'bad' && 'bg-danger',
              )}
              style={{ width: `${usagePercent(usage)}%` }}
            />
          </div>
        )}
      </Stat>

      <Stat
        label={`Выпущено ${monthIn(now)}`}
        value={data.issuedMonth}
        to="/registry?tab=analytics&period=30d"
        aside={summary && <Sparkline points={summary.issued.byDay} />}
        hint={
          <span className={cn(delta.tone === 'up' && 'text-ok', delta.tone === 'down' && 'text-warn')}>
            {delta.text}
          </span>
        }
      />

      <Stat
        label="Письма доставлены"
        value={deliveredShare === null ? '—' : deliveredShare}
        unit={deliveredShare === null ? undefined : '%'}
        to="/mailing"
        hint={
          sent === 0 ? (
            'Писем пока не было'
          ) : (
            <>
              {delivered} из {sent}
              {undelivered > 0 && (
                <>
                  {' '}
                  · <span className="text-danger">{undelivered} не дошло</span>
                </>
              )}
            </>
          )
        }
      />

      <Stat
        label="Проверки по QR"
        value={summary ? summary.checks.total : data.verifiedMonth}
        unit={
          summary
            ? plural(summary.checks.total, 'проверка', 'проверки', 'проверок')
            : plural(data.verifiedMonth, 'документ', 'документа', 'документов')
        }
        hint={summary ? `за 30 дней · ${data.verificationsTotal} всего` : `за месяц · ${data.verificationsTotal} всего`}
        to="/registry?tab=analytics&period=30d"
        aside={summary && <Sparkline points={summary.checks.byDay} tone="ok" />}
      />
    </>
  );
}
