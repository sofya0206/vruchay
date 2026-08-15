import { Link } from 'react-router-dom';
import { Gift } from 'lucide-react';
import { useUsage } from '../api/org';

/**
 * Остаток бесплатной пробы.
 *
 * Стоит на главной странице кабинета, а не всплывает в отказе. Узнать
 * о конце пробы на сорок седьмом документе из пятидесяти — это уже
 * испорченное награждение: человек не успевает ни доплатить, ни разбить
 * список на части.
 *
 * На оплаченном тарифе не показывается вовсе: считать там нечего,
 * а лишняя полоска на главной только отвлекает.
 */
export function UsageBar() {
  const { data } = useUsage();
  if (!data || data.plan === 'paid' || data.limit === null || data.left === null) return null;

  const used = Math.min(data.used, data.limit);
  const percent = data.limit > 0 ? Math.round((used / data.limit) * 100) : 0;
  // Предупреждаем заранее, а не по факту: на десяти оставшихся документах
  // ещё можно что-то предпринять, на нуле — уже нет.
  const low = data.left <= 10;

  return (
    <div className="mb-6 rounded-2xl bg-[var(--surface)] p-4 ring-1 ring-[var(--line)]">
      <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
        <span className="font-medium">
          Бесплатная проба: осталось {data.left} из {data.limit}
        </span>
        {data.bonus > 0 && (
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
        aria-label="Использовано документов из бесплатной пробы"
      >
        <div
          className={`h-full rounded-full ${low ? 'bg-[var(--danger)]' : 'bg-[var(--accent)]'}`}
          style={{ width: `${percent}%` }}
        />
      </div>

      <p className="mt-2 text-sm text-[var(--text-muted)]">
        {data.left === 0 ? (
          <>
            Проба закончилась. Чтобы выпускать дальше, выберите тариф — или{' '}
            <Link to="/settings" className="underline underline-offset-2">
              пригласите коллегу
            </Link>
            : за каждого, кто начнёт работать, добавим документов.
          </>
        ) : low ? (
          <>
            Осталось немного. Если впереди большое награждение — выберите тариф заранее или{' '}
            <Link to="/settings" className="underline underline-offset-2">
              пригласите коллегу
            </Link>
            .
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
