import { Check, Mail, RefreshCw } from 'lucide-react';
import { useMe } from '../auth/useAuth';
import { ErrorBar } from '../ui/ErrorState';
import { Loading } from '../ui/Loading';
import { Stat } from '../ui/Stat';
import { useOrgAnalytics, type OrgAnalytics } from '../api/analytics';
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
      <section className="space-y-3 border-t border-line pt-8">
        <h2 className="text-lg font-medium">Качество выпуска</h2>
        <ErrorBar onRetry={() => void analytics.refetch()}>Цифры не посчитались</ErrorBar>
      </section>
    );
  }

  const data = analytics.data;

  return (
    <section className="space-y-8 border-t border-line pt-8">
      <Quality data={data} />

      {me.data?.isPlatform && <PlatformFunnel />}
      {me.data?.isPlatform && <TourDropOff />}
    </section>
  );
}

/** Не врём ли мы клиенту: пакеты без ошибок и перевыпуски. */
function Quality({ data }: { data: OrgAnalytics }) {
  const { packages, reissues } = data;
  const aside = 'text-muted';

  return (
    <section>
      <h2 className="mb-3 text-lg font-medium">Качество выпуска</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat
          label="Пакетов без единой ошибки"
          value={formatShare(packages.cleanShare)}
          aside={<Check size={16} strokeWidth={1.75} aria-hidden className={aside} />}
          hint={
            packages.finished > 0
              ? `${formatCount(packages.clean)} из ${formatCount(packages.finished)} законченных`
              : 'Законченных пакетов ещё нет'
          }
        />
        <Stat
          label="Документов пришлось перевыпустить"
          value={formatShare(reissues.share)}
          aside={<RefreshCw size={16} strokeWidth={1.75} aria-hidden className={aside} />}
          hint={
            reissues.count > 0
              ? `${formatCount(reissues.count)} ${plural(reissues.count, 'документ', 'документа', 'документов')} — растущая доля значит, что ошибка где-то у нас`
              : 'Ни одного перевыпуска'
          }
        />
        <Stat
          label="Разослано писем"
          value={formatCount(data.mailed)}
          aside={<Mail size={16} strokeWidth={1.75} aria-hidden className={aside} />}
          hint="Ушедшие участникам, включая вернувшиеся"
        />
      </div>
    </section>
  );
}
