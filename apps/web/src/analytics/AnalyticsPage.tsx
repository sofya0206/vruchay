import { Link } from 'react-router-dom';
import { Check, Mail, QrCode, RefreshCw, Timer } from 'lucide-react';
import { useMe } from '../auth/useAuth';
import { Loading } from '../ui/Loading';
import { Button } from '../ui/Button';
import {
  useDigestPreview,
  useOrgAnalytics,
  type ActivationStep,
  type MonthNumbers,
  type OrgAnalytics,
} from '../api/analytics';
import { plural } from '../registry/registry-format';
import { formatCount, formatDuration, formatShare, withinTarget } from './analytics-format';
import { PlatformFunnel } from './PlatformFunnel';

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
        <h2 className="text-lg font-medium">По организации</h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Что происходит с выданными документами и где спотыкается награждение
        </p>
      </header>

      <Verifications data={data} />
      <Quality data={data} />
      <Activation steps={data.activation.steps} timeToFirst={data.timeToFirst} />
      <Months data={data} />

      {me.data?.isPlatform && <PlatformFunnel />}
    </section>
  );
}

/** Главная цифра раздела: сколько раз выданное проверяли по QR-коду. */
function Verifications({ data }: { data: OrgAnalytics }) {
  const { total, files } = data.verifications;

  return (
    <section>
      <h2 className="mb-3 text-lg font-medium">Проверки по QR-коду</h2>
      <div className="rounded-2xl bg-[var(--accent-soft)] p-5">
        <p className="flex items-center gap-2 text-3xl text-[var(--accent)] tabular-nums">
          <QrCode size={24} strokeWidth={1.5} />
          {formatCount(total)}
        </p>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          {plural(total, 'проверка', 'проверки', 'проверок')} у {formatCount(files)}{' '}
          {plural(files, 'документа', 'документов', 'документов')} из {formatCount(data.issued)}{' '}
          выданных
        </p>
        <p className="mt-3 max-w-prose text-sm text-[var(--text-muted)]">
          Каждая проверка — это чей-то работодатель, приёмная комиссия или судья, сканировавшие
          QR-код с вашего бланка. Это единственное свидетельство, что документ живёт после
          награждения. Кто и откуда проверял, мы не собираем.
        </p>
        <Link
          to="/registry"
          className="mt-4 inline-block text-sm text-[var(--accent)] underline underline-offset-4"
        >
          Посмотреть по мероприятиям в реестре
        </Link>
      </div>
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
                  ? 'bg-[var(--accent)] text-white'
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

/** Два последних месяца и кнопка «прислать себе сводку». */
function Months({ data }: { data: OrgAnalytics }) {
  const preview = useDigestPreview();

  return (
    <section>
      <h2 className="mb-3 text-lg font-medium">По месяцам</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <MonthCard numbers={data.thisMonth} note="идёт сейчас" />
        <MonthCard numbers={data.lastMonth} note="о нём приходит сводка" />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button
          variant="secondary"
          onClick={() => preview.mutate()}
          disabled={preview.isPending}
        >
          {preview.isPending ? 'Отправляем…' : 'Прислать сводку себе'}
        </Button>
        <p className="text-xs text-[var(--text-muted)]">
          {preview.isSuccess
            ? 'Отправили на ваш адрес — то же письмо владелец получает первого числа.'
            : preview.isError
              ? 'Письмо не ушло. Проверьте настройки почты и попробуйте ещё раз.'
              : 'Сводка за прошлый месяц уходит владельцу аккаунта первого числа.'}
        </p>
      </div>
    </section>
  );
}

function MonthCard({ numbers, note }: { numbers: MonthNumbers; note: string }) {
  return (
    <div className="card p-5">
      <p className="font-medium">
        {numbers.title} <span className="text-xs text-[var(--text-muted)]">· {note}</span>
      </p>
      <dl className="mt-3 space-y-1 text-sm">
        <Row label="Выпущено" value={formatCount(numbers.issued)} />
        <Row label="Разослано" value={formatCount(numbers.mailed)} />
        <Row label="Документов проверяли" value={formatCount(numbers.verifiedFiles)} />
      </dl>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-[var(--text-muted)]">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
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
