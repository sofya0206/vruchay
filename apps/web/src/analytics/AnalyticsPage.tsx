import { Check, Mail, RefreshCw, Timer } from 'lucide-react';
import { useMe } from '../auth/useAuth';
import { Loading } from '../ui/Loading';
import {
  useOrgAnalytics,
  type ActivationStep,
  type OrgAnalytics,
} from '../api/analytics';
import { plural } from '../registry/registry-format';
import { formatCount, formatDuration, formatShare, withinTarget } from './analytics-format';
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
      <header>
        <h2 className="text-lg font-medium">Качество и активация</h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Не врём ли клиенту: перевыпуски, пакеты с ошибками и путь до первого документа
        </p>
      </header>

      <Quality data={data} />
      <Activation steps={data.activation.steps} timeToFirst={data.timeToFirst} />

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

/** Путь организации от регистрации до второго мероприятия. */
function Activation({
  steps,
  timeToFirst,
}: {
  steps: ActivationStep[];
  timeToFirst: OrgAnalytics['timeToFirst'];
}) {
  const inTime = withinTarget(timeToFirst.minutes, timeToFirst.targetMinutes);

  return (
    <section>
      <h2 className="mb-3 text-lg font-medium">Ваш путь</h2>

      <div className="card p-5">
        <p className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
          <Timer size={16} strokeWidth={1.5} />
          От регистрации до первого выпущенного документа
        </p>
        <p
          className={`mt-1 text-2xl tabular-nums ${
            timeToFirst.minutes === null
              ? 'text-[var(--text-muted)]'
              : inTime
                ? 'text-[var(--accent)]'
                : 'text-[var(--text)]'
          }`}
        >
          {formatDuration(timeToFirst.minutes)}
        </p>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          {timeToFirst.minutes === null
            ? 'Первый документ ещё не выпущен'
            : `Ориентир — меньше ${timeToFirst.targetMinutes} минут`}
        </p>
      </div>

      <ol className="mt-4 space-y-2">
        {steps.map((step) => (
          <li
            key={step.key}
            className="flex items-center gap-3 hairline rounded-xl px-4 py-3"
          >
            <span
              className={`flex size-6 shrink-0 items-center justify-center rounded-full ${
                step.done
                  ? 'bg-[var(--accent-button)] text-[var(--accent-contrast)]'
                  : 'bg-[var(--surface-sunken)] text-[var(--text-muted)]'
              }`}
            >
              {step.done ? <Check size={14} strokeWidth={2.5} /> : null}
            </span>
            <span className={step.done ? '' : 'text-[var(--text-muted)]'}>{step.label}</span>
          </li>
        ))}
      </ol>
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
