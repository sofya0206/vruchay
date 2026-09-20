import { Link } from 'react-router-dom';
import { Gift } from 'lucide-react';
import { useUsage } from '../api/org';
import { DiscussTermsLink } from '../billing/DiscussTermsLink';
import { Stat } from '../ui/Stat';
import { cn } from '../ui/cn';

/**
 * Остаток документов: по бесплатной пробе или по назначенному плану.
 *
 * Стоит над списком документов, а не всплывает в отказе. Узнать
 * о конце квоты на сорок седьмом документе из пятидесяти — это уже
 * испорченное награждение: человек не успевает ни договориться
 * о продолжении, ни разбить список на части.
 *
 * Там, где предела нет вовсе, не показывается: считать нечего, а лишняя
 * плитка над списком только отвлекает.
 */
export function UsageBar() {
  const { data } = useUsage();
  if (!data || data.limit === null || data.left === null) return null;

  const used = Math.min(data.used, data.limit);
  const percent = data.limit > 0 ? Math.round((used / data.limit) * 100) : 0;
  /*
   * Предупреждаем заранее, а не по факту: на двадцати процентах остатка
   * ещё можно разделить награждение или договориться, на нуле — уже нет.
   * Порог считает сервер — тот же, который решает, пускать ли к выпуску.
   */
  const soon = data.warn === 'low';
  const low = data.warn === 'critical' || data.warn === 'exhausted' || data.warn === 'expired';
  /** Приглашения прибавляются только к пробе — на плане про них молчим. */
  const trial = data.source === 'trial';

  return (
    <Stat
      className="mb-6"
      label={`${data.planName}: осталось`}
      value={data.left}
      unit={`из ${data.limit}`}
      tone={low ? 'danger' : soon ? 'warn' : 'default'}
      aside={
        trial &&
        data.bonus > 0 && (
          <span className="flex items-center gap-1 text-sm text-accent">
            <Gift size={16} aria-hidden /> +{data.bonus} за приглашённых друзей
          </span>
        )
      }
      hint={
        data.expired ? (
          <>
            Срок плана закончился, поэтому новый выпуск не начнётся. Уже выданные документы
            остаются действительными, и проверка по QR-коду работает.{' '}
            <DiscussTermsLink>Обсудим продление</DiscussTermsLink>.
          </>
        ) : data.left === 0 ? (
          trial ? (
            <>
              Проба закончилась. Напишите нам —{' '}
              <DiscussTermsLink>обсудим условия и добавим документов</DiscussTermsLink>. Или{' '}
              <Link to="/referral" className="underline underline-offset-2">
                пригласите коллегу
              </Link>
              : за каждого, кто начнёт работать, добавим документов.
            </>
          ) : (
            <>
              План израсходован: новый выпуск не начнётся, а уже запущенный дойдёт до конца.
              Выданные документы остаются действительными. Напишите нам —{' '}
              <DiscussTermsLink>обсудим условия и добавим документов</DiscussTermsLink>.
            </>
          )
        ) : low || soon ? (
          <>
            Осталось немного. Если впереди большое награждение —{' '}
            <DiscussTermsLink>договоритесь о продолжении заранее</DiscussTermsLink>
            {trial ? ' или ' : '.'}
            {trial && (
              <>
                <Link to="/referral" className="underline underline-offset-2">
                  пригласите коллегу
                </Link>
                .
              </>
            )}
          </>
        ) : (
          // На телефоне — только полоса и число: пояснение там читают один
          // раз, а место занимает всегда.
          <span className="max-md:hidden">
            Считаются только созданные файлы. Черновики, правки макета и повторные
            просмотры не тратят ничего.
          </span>
        )
      }
    >
      <div
        role="progressbar"
        aria-valuenow={used}
        aria-valuemin={0}
        aria-valuemax={data.limit}
        aria-label="Использовано документов из квоты"
        className="h-1 overflow-hidden rounded-full bg-sunken"
      >
        <div
          className={cn('h-full rounded-full', low ? 'bg-danger' : soon ? 'bg-warn' : 'bg-accent')}
          style={{ width: `${percent}%` }}
        />
      </div>
    </Stat>
  );
}
