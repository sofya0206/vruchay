import { Link } from 'react-router-dom';
import { Gift } from 'lucide-react';
import { useUsage } from '../api/org';
import { DiscussTermsLink } from '../billing/DiscussTermsLink';

/**
 * Остаток документов: по бесплатной пробе или по назначенному плану.
 *
 * Стоит на главной странице кабинета, а не всплывает в отказе. Узнать
 * о конце квоты на сорок седьмом документе из пятидесяти — это уже
 * испорченное награждение: человек не успевает ни договориться
 * о продолжении, ни разбить список на части.
 *
 * Там, где предела нет вовсе, не показывается: считать нечего, а лишняя
 * полоска на главной только отвлекает.
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
    <div className="mb-6 rounded-2xl bg-[var(--surface)] p-4 ring-1 ring-[var(--line)]">
      <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
        <span className="font-medium">
          {data.planName}: осталось {data.left} из {data.limit}
        </span>
        {trial && data.bonus > 0 && (
          <span className="flex items-center gap-1 text-[var(--accent)]">
            <Gift size={14} /> +{data.bonus} за приглашённых друзей
          </span>
        )}
      </div>

      <div
        className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--surface-sunken)]"
        role="progressbar"
        aria-valuenow={used}
        aria-valuemin={0}
        aria-valuemax={data.limit}
        aria-label="Использовано документов из квоты"
      >
        <div
          className={`h-full rounded-full ${low ? 'bg-[var(--danger)]' : 'bg-[var(--accent)]'}`}
          style={{ width: `${percent}%` }}
        />
      </div>

      <p className="mt-2 text-sm text-[var(--text-muted)]">
        {data.expired ? (
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
              <Link to="/settings/referral" className="underline underline-offset-2">
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
                <Link to="/settings/referral" className="underline underline-offset-2">
                  пригласите коллегу
                </Link>
                .
              </>
            )}
          </>
        ) : (
          <>
            Считаются только созданные файлы. Черновики, правки макета и повторные
            просмотры не тратят ничего.
          </>
        )}
      </p>
    </div>
  );
}
