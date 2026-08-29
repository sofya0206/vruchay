import type { ReactNode } from 'react';
import { CalendarDays, FileCheck2, Gift, Mail } from 'lucide-react';
import type { Overview } from '../api/overview';
import { DiscussTermsLink } from '../billing/DiscussTermsLink';
import { plural } from './format';

/**
 * Четыре цифры о награждениях.
 *
 * Не витрина достижений: каждая отвечает на вопрос, который человек
 * задаёт себе перед работой. Сколько всего выдано, сколько за месяц,
 * хватит ли остатка на ближайшее награждение и дошли ли письма.
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
  const soon = usage.warn === 'low';

  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Metric
        icon={<FileCheck2 size={16} />}
        label="Выпущено всего"
        value={data.issuedTotal}
        hint={`${plural(data.issuedTotal, 'документ', 'документа', 'документов')} за всё время`}
      />
      <Metric
        icon={<CalendarDays size={16} />}
        label="В этом месяце"
        value={data.issuedMonth}
        hint={data.issuedMonth === 0 ? 'В этом месяце пока ничего' : 'С первого числа'}
      />
      <Metric
        icon={<Gift size={16} />}
        label={usage.source === 'trial' ? 'Осталось на пробе' : 'Осталось по плану'}
        value={unlimited ? '∞' : (usage.left ?? 0)}
        tone={low ? 'danger' : 'normal'}
        hint={
          unlimited ? (
            'Без ограничения по документам'
          ) : usage.expired ? (
            <>
              Срок плана закончился · выданные документы остаются действительными ·{' '}
              <DiscussTermsLink>обсудим продление</DiscussTermsLink>
            </>
          ) : (
            <>
              из {usage.limit}
              {usage.source !== 'trial' && <> · {usage.planName}</>}
              {usage.bonus > 0 && <> · +{usage.bonus} за приглашённых</>}
              {/*
                * Ссылки на страницу тарифов нет: публичных цен больше нет,
                * а вести человека на заглушку хуже, чем сказать словами.
                * Ведём на форму «Обсудить условия» — единственный путь дальше.
                */}
              {(low || soon) && (
                <>
                  {' · '}
                  <DiscussTermsLink>напишите нам, добавим документов</DiscussTermsLink>
                </>
              )}
            </>
          )
        }
      />
      <Metric
        icon={<Mail size={16} />}
        label="Писем отправлено"
        value={data.emailsSent}
        hint={data.emailsSent === 0 ? 'Рассылка ещё не запускалась' : 'Ушло участникам'}
      />
    </ul>
  );
}

function Metric({
  icon,
  label,
  value,
  hint,
  tone = 'normal',
}: {
  icon: ReactNode;
  label: string;
  value: number | string;
  hint: ReactNode;
  tone?: 'normal' | 'danger';
}) {
  return (
    <li className="rounded-2xl bg-[var(--surface)] p-4 ring-1 ring-[var(--line)]">
      <span className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
        {icon}
        {label}
      </span>
      <p
        className={`mt-2 text-3xl font-semibold tabular-nums ${
          tone === 'danger' ? 'text-[var(--danger)]' : ''
        }`}
      >
        {value}
      </p>
      <p className="mt-1 text-sm text-[var(--text-muted)]">{hint}</p>
    </li>
  );
}
