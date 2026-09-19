import { Check, Mail, RefreshCw } from 'lucide-react';
import { useMe } from '../auth/useAuth';
import { Loading } from '../ui/Loading';
import {
  useOrgAnalytics,
  type OrgAnalytics,
} from '../api/analytics';
import { plural } from '../registry/registry-format';
import { formatCount, formatShare } from './analytics-format';
import { PlatformFunnel } from './PlatformFunnel';
import { TourDropOff } from '../onboarding/TourDropOff';

/**
 * Раздел «Аналитика».
 *
 * Отвечает на два вопроса, ради которых сюда заходят: живут ли выданные
 * документы (проверки по QR) и не врём ли мы клиенту (перевыпуски
 * и пакеты с ошибками).
 *
 * Ничего личного здесь нет и быть не может: все цифры — счётчики
 * по документам организации. Кто сканировал QR-код, откуда и с какого
 * устройства, мы не собираем — это перевело бы нас из обработчика
 * по поручению в самостоятельного оператора персональных данных.
 */
export function AnalyticsPage() {
  const me = useMe();
  const analytics = useOrgAnalytics();

  if (analytics.isPending) return <Loading label="Считаем" />;
  if (analytics.isError || !analytics.data) {
    return (
      <section className="space-y-8">
        <h2 className="text-lg font-medium">По организации</h2>
        <p className="mt-2 text-sm text-[var(--text-muted)]">Цифры сейчас не посчитать.</p>
      </section>
    );
  }

  const data = analytics.data;

  return (
    <section className="space-y-8 border-t border-[var(--line)] pt-8">
      <Quality data={data} />

      {me.data?.isPlatform && <PlatformFunnel />}
      {me.data?.isPlatform && <TourDropOff />}
    </section>
  );
}

/** Не врём ли мы клиенту: пакеты без ошибок и перевыпуски. */
function Quality({ data }: { data: OrgAnalytics }) {
  const { packages, reissues } = data;

  return (
    <section>
      <h2 className="mb-3 text-lg font-medium">Качество выпуска</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <Tile
          icon={<Check size={16} strokeWidth={1.5} />}
          value={formatShare(packages.cleanShare)}
          label="Пакетов без единой ошибки"
          hint={
            packages.finished > 0
              ? `${formatCount(packages.clean)} из ${formatCount(packages.finished)} законченных`
              : 'Законченных пакетов ещё нет'
          }
        />
        <Tile
          icon={<RefreshCw size={16} strokeWidth={1.5} />}
          value={formatShare(reissues.share)}
          label="Документов пришлось перевыпустить"
          hint={
            reissues.count > 0
              ? `${formatCount(reissues.count)} ${plural(reissues.count, 'документ', 'документа', 'документов')} — растущая доля значит, что ошибка где-то у нас`
              : 'Ни одного перевыпуска'
          }
        />
        <Tile
          icon={<Mail size={16} strokeWidth={1.5} />}
          value={formatCount(data.mailed)}
          label="Разослано писем"
          hint="Ушедшие участникам, включая вернувшиеся"
        />
      </div>
    </section>
  );
}

function Tile({
  icon,
  value,
  label,
  hint,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
  hint: string;
}) {
  return (
    <div className="hairline rounded-xl p-4">
      <p className="flex items-center gap-2 text-2xl tabular-nums">
        <span className="text-[var(--text-muted)]">{icon}</span>
        {value}
      </p>
      <p className="mt-1 text-xs">{label}</p>
      <p className="mt-1 text-xs text-[var(--text-muted)]">{hint}</p>
    </div>
  );
}
