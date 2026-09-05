import { Info } from 'lucide-react';
import { usePlatformFunnel } from '../api/analytics';
import { Loading } from '../ui/Loading';
import { plural } from '../registry/registry-format';
import { formatCount, formatDuration, formatShare } from './analytics-format';

/**
 * Воронка активации по всем организациям — то, что видим только мы.
 *
 * Показывает, где люди отваливаются между регистрацией и первым
 * разосланным пакетом. Ни одной организации по имени: это статистика,
 * а не наблюдение за клиентами.
 */
export function PlatformFunnel() {
  const funnel = usePlatformFunnel(true);

  if (funnel.isPending) return <Loading label="Считаем воронку" />;
  if (funnel.isError || !funnel.data) return null;

  const data = funnel.data;
  const widest = Math.max(...data.steps.map((s) => s.organizations), 1);

  return (
    <section className="rounded-2xl bg-[var(--surface-sunken)] p-5">
      <h2 className="font-serif text-lg">Воронка активации</h2>
      <p className="mt-1 text-sm text-[var(--text-muted)]">
        По всем {formatCount(data.organizations)}{' '}
        {plural(data.organizations, 'организации', 'организациям', 'организациям')} сервиса.
        Видно только нам.
      </p>

      <div className="mt-4 space-y-2">
        {data.steps.map((step) => (
          <div key={step.key} className="rounded-xl bg-[var(--surface)] p-3">
            <div className="flex flex-wrap items-baseline gap-x-3">
              <span className="text-sm">{step.label}</span>
              <span className="ml-auto text-sm tabular-nums">
                {formatCount(step.organizations)} · {formatShare(step.share)}
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--surface-sunken)]">
              <div
                className="h-full rounded-full bg-[var(--accent)]"
                style={{ width: `${Math.round((step.organizations / widest) * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      <p className="mt-3 flex max-w-prose items-start gap-2 text-xs text-[var(--text-muted)]">
        <Info size={14} strokeWidth={1.5} className="mt-0.5 shrink-0" />
        {data.notes.checked}
      </p>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <Stat
          value={formatDuration(data.timeToFirst.medianMinutes)}
          label="Медиана до первого документа"
          hint={`Уложились в ${data.timeToFirst.targetMinutes} минут: ${formatShare(
            data.timeToFirst.inTargetShare,
          )} из ${formatCount(data.timeToFirst.organizations)} выпускавших`}
        />
        <Stat
          value={formatShare(data.packages.cleanShare)}
          label="Пакетов без ошибок"
          hint={`${formatCount(data.packages.clean)} из ${formatCount(data.packages.finished)} законченных`}
        />
        <Stat
          value={formatShare(data.reissues.share)}
          label="Доля перевыпусков"
          hint={`${formatCount(data.reissues.count)} из ${formatCount(data.reissues.issued)} выданных`}
        />
      </div>
    </section>
  );
}

function Stat({ value, label, hint }: { value: string; label: string; hint: string }) {
  return (
    <div className="rounded-xl bg-[var(--surface)] p-4">
      <p className="text-xl tabular-nums">{value}</p>
      <p className="mt-1 text-xs">{label}</p>
      <p className="mt-1 text-xs text-[var(--text-muted)]">{hint}</p>
    </div>
  );
}
