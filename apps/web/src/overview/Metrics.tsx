import { Link } from 'react-router-dom';
import type { Overview } from '../api/overview';
import { DiscussTermsLink } from '../billing/DiscussTermsLink';

/**
 * Четыре цифры о награждениях — плитками, каждая ведёт туда, где
 * за ней стоит список.
 *
 * Число и слово под ним; всё, что нужно объяснить, объясняется только
 * когда это важно — когда документы заканчиваются.
 */
export function Metrics({ data }: { data: Overview }) {
  const { usage } = data;
  const unlimited = usage.limit === null || usage.left === null;
  /*
   * Предупреждаем заранее, а не по факту: на двадцати процентах остатка
   * ещё можно разделить награждение или договориться, на нуле — уже нет.
   * Порог считает сервер — тот же, который решает, пускать ли к выпуску,
   * иначе цифра на экране и решение о допуске однажды разойдутся.
   */
  const low = usage.warn === 'critical' || usage.warn === 'exhausted' || usage.warn === 'expired';

  return (
    <div>
      <ul className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Metric label="Выдано всего" value={data.issuedTotal} to="/registry" />
        <Metric label="За этот месяц" value={data.issuedMonth} to="/registry?tab=analytics" />
        <Metric label="Писем отправлено" value={data.emailsSent} to="/mailing" />
        <Metric
          label={usage.source === 'trial' ? 'Осталось на пробе' : 'Осталось по плану'}
          value={unlimited ? '∞' : (usage.left ?? 0)}
          tone={low ? 'danger' : 'normal'}
          to="/billing"
        />
      </ul>

      {/* Единственная строка, которая здесь осталась: срок плана кончился.
          Про кончающийся остаток словами больше не пишем — о нём говорит
          сама цифра, красная. А вот про истёкший срок цифра не скажет:
          «осталось 380» при мёртвом плане читается как «всё в порядке».
          Первый вопрос при этом — не пропали ли уже выданные документы,
          и ответ на него не должен зависеть от того, дозвонились ли до нас. */}
      {usage.expired && (
        <p className="mt-3 text-sm text-[var(--text-muted)]">
          Срок плана закончился · выданные документы остаются действительными ·{' '}
          {/*
           * Ссылки на страницу тарифов нет: публичных цен больше нет,
           * а вести человека на заглушку хуже, чем сказать словами.
           * Ведём на форму «Обсудить условия» — единственный путь дальше.
           */}
          <DiscussTermsLink>обсудим продление</DiscussTermsLink>
        </p>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  to,
  tone = 'normal',
}: {
  label: string;
  value: number | string;
  to: string;
  tone?: 'normal' | 'danger';
}) {
  return (
    <li>
      <Link
        to={to}
        className="card block p-5 transition-colors hover:bg-[var(--accent-soft)]"
      >
        <p
          className={`text-3xl font-semibold tabular-nums ${
            tone === 'danger' ? 'text-[var(--danger)]' : ''
          }`}
        >
          {value}
        </p>
        <p className="mt-0.5 text-sm text-[var(--text-muted)]">{label}</p>
      </Link>
    </li>
  );
}
