import { type ReactNode, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { CreditCard, FileText, Mail, QrCode } from 'lucide-react';
import { useUsage } from '../api/org';
import { useRegistryFacets } from '../api/registry';
import {
  useAnalyticsSummary,
  type Period,
  type Summary,
  type SummaryMaterial,
} from '../api/analytics';
import { Tabs } from '../ui/Tabs';
import { Select } from '../ui/Select';
import { SkeletonTiles } from '../ui/Skeleton';
import { ErrorState } from '../ui/ErrorState';
import { EmptyState } from '../ui/EmptyState';
import { cn } from '../ui/cn';
import { usePhone } from '../ui/useMediaQuery';
import { plural, formatDate, formatDateTime } from '../registry/registry-format';
import { formatCount } from './analytics-format';
import { DiscussTermsLink } from '../billing/DiscussTermsLink';
import { DayChart, Sparkline } from './DayChart';

/**
 * Экран «Аналитика» в реестре.
 *
 * Отвечает на три вопроса, ради которых сюда заходят: сколько выпустили
 * и по каким материалам, живут ли выданные документы (проверки по QR)
 * и сколько осталось по плану. Один фильтр на весь экран — период
 * и материал; сверху четыре плитки, ниже графики по дням, состояние
 * выданных и таблица по материалам.
 *
 * Ничего личного здесь нет и быть не может: все цифры — счётчики
 * по документам организации. Кто сканировал QR-код, откуда и с какого
 * устройства, мы не собираем.
 */

export const PERIOD_ITEMS: { id: Period; label: string; short: string }[] = [
  { id: '7d', label: '7 дней', short: '7 дн' },
  { id: '30d', label: '30 дней', short: '30 дн' },
  { id: '90d', label: '90 дней', short: '90 дн' },
  { id: '365d', label: 'Год', short: 'Год' },
  { id: 'all', label: 'Всё время', short: 'Всё' },
];

const PERIOD_NOTE: Record<Period, string> = {
  '7d': 'к прошлым 7 дням',
  '30d': 'к прошлым 30 дням',
  '90d': 'к прошлым 90 дням',
  '365d': 'к прошлому году',
  all: 'за всё время',
};

export function SummaryScreen({
  period,
  documentId,
  onPeriod,
  onDocument,
}: {
  period: Period;
  documentId: string;
  onPeriod: (p: Period) => void;
  onDocument: (id: string) => void;
}) {
  const phone = usePhone();
  const summary = useAnalyticsSummary(period, documentId);
  const usage = useUsage();
  const facets = useRegistryFacets();

  const materialOptions = useMemo(
    () => [
      { value: '', label: 'Все материалы' },
      ...(facets.data?.documents ?? []).map((d) => ({
        value: d.id,
        label: d.title,
        hint: d.eventName || undefined,
      })),
    ],
    [facets.data],
  );

  const toolbar = (
    <div className="flex flex-wrap items-center gap-2">
      <Tabs
        label="Период"
        value={period}
        onChange={onPeriod}
        items={PERIOD_ITEMS.map((p) => ({ id: p.id, label: phone ? p.short : p.label }))}
        stretch={phone}
        className={phone ? 'w-full' : ''}
      />
      <Select
        value={documentId}
        onChange={onDocument}
        options={materialOptions}
        placeholder="Все материалы"
        className={phone ? 'w-full' : 'min-w-48 max-w-72'}
        title="Материал"
      />
    </div>
  );

  if (summary.isPending) {
    return (
      <div className="space-y-4">
        {toolbar}
        <SkeletonTiles label="Считаем" />
      </div>
    );
  }
  if (summary.isError || !summary.data) {
    return (
      <div className="space-y-4">
        {toolbar}
        <ErrorState
          title="Сводка не посчиталась"
          onRetry={() => summary.refetch()}
          retrying={summary.isFetching}
        >
          Попробуйте ещё раз через минуту.
        </ErrorState>
      </div>
    );
  }

  const data = summary.data;
  const u = usage.data;
  const limit = u?.limit ?? null;
  const unlimited = !u || limit === null || u.left === null;
  const usedShare =
    u && limit !== null && limit > 0 ? Math.min(100, Math.round((u.used / limit) * 100)) : 0;
  const usageTone = !u
    ? 'ok'
    : u.warn === 'critical' || u.warn === 'exhausted' || u.warn === 'expired'
      ? 'bad'
      : u.warn === 'low'
        ? 'warn'
        : 'ok';
  const deliveredShare =
    data.mail.sent > 0 ? Math.round((data.mail.delivered / data.mail.sent) * 100) : null;
  const stale = summary.isFetching && summary.isPlaceholderData;

  const empty = data.issued.total === 0 && data.checks.total === 0;

  return (
    <div className={cn('space-y-4 transition-opacity', stale && 'opacity-60')} aria-busy={stale}>
      {toolbar}

      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile
          icon={FileText}
          label="Выпущено"
          value={formatCount(data.issued.total)}
          delta={
            <Delta now={data.issued.total} prev={data.issued.prev} note={PERIOD_NOTE[period]} />
          }
          aside={<Sparkline points={data.issued.byDay} />}
          to={documentId ? `/registry?documentId=${documentId}` : '/registry'}
        />
        <Tile
          icon={QrCode}
          label={phone ? 'Проверок' : 'Проверок по QR'}
          value={formatCount(data.checks.total)}
          delta={
            <Delta
              now={data.checks.total}
              prev={data.checks.prev}
              note={
                data.checks.files > 0
                  ? `${formatCount(data.checks.files)} ${plural(data.checks.files, 'документ', 'документа', 'документов')} проверяли`
                  : PERIOD_NOTE[period]
              }
            />
          }
          aside={<Sparkline points={data.checks.byDay} tone="ok" />}
        />
        <Tile
          icon={Mail}
          label={phone ? 'Письма' : 'Письма доставлены'}
          value={deliveredShare === null ? '—' : `${deliveredShare} %`}
          delta={
            data.mail.sent === 0 ? (
              <span className="text-[var(--text-muted)]">Писем за период не было</span>
            ) : (
              <span className="text-[var(--text-muted)]">
                {formatCount(data.mail.delivered)} из {formatCount(data.mail.sent)}
                {data.mail.undelivered > 0 && (
                  <>
                    {' '}
                    · <span className="text-[var(--danger)]">{data.mail.undelivered} не дошло</span>
                  </>
                )}
              </span>
            )
          }
          to="/mailing"
        />
        <Tile
          icon={CreditCard}
          label={
            phone ? 'Осталось' : u?.source === 'trial' ? 'Осталось на пробе' : 'Осталось по плану'
          }
          value={
            unlimited ? (
              '∞'
            ) : (
              <>
                {formatCount(u.left ?? 0)}{' '}
                <span className="text-sm font-normal text-[var(--text-muted)]">
                  из {formatCount(u.limit ?? 0)}
                </span>
              </>
            )
          }
          danger={usageTone === 'bad'}
          delta={
            u?.expired ? (
              <span className="text-[var(--text-muted)]">
                Срок плана закончился · <DiscussTermsLink>обсудим продление</DiscussTermsLink>
              </span>
            ) : (
              <span className="text-[var(--text-muted)]">
                {u?.planName}
                {u?.endsAt && !u.neverExpires ? ` · до ${formatDate(u.endsAt)}` : ''}
              </span>
            )
          }
          to="/billing"
        >
          {!unlimited && (
            <div
              role="progressbar"
              aria-label="Израсходовано по плану"
              aria-valuenow={usedShare}
              aria-valuemin={0}
              aria-valuemax={100}
              className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-sunken)]"
            >
              <div
                className={cn(
                  'h-full rounded-full',
                  usageTone === 'ok' && 'bg-[var(--accent)]',
                  usageTone === 'warn' && 'bg-[var(--warn)]',
                  usageTone === 'bad' && 'bg-[var(--danger)]',
                )}
                style={{ width: `${usedShare}%` }}
              />
            </div>
          )}
        </Tile>
      </ul>

      {empty ? (
        <EmptyState icon={QrCode} title="За этот период пусто">
          Ни одного выпуска и ни одной проверки. Выпущенные документы появятся здесь сразу, а
          проверки — когда кто-то откроет QR-код на выданном.
        </EmptyState>
      ) : (
        <>
          <div className="grid gap-3 lg:grid-cols-[3fr_2fr]">
            <Panel
              title="По дням"
              note={
                data.range.from
                  ? `${formatDate(data.range.from)} — ${formatDate(data.range.to)}`
                  : 'последний год'
              }
            >
              <div className="mb-1 flex gap-4 text-xs text-[var(--text-muted)]">
                <LegendItem tone="accent">Выпущено</LegendItem>
                <LegendItem tone="ok">Проверок</LegendItem>
              </div>
              <DayChart
                points={data.issued.byDay}
                label="Выпущено"
                unit={(n) =>
                  `${formatCount(n)} ${plural(n, 'документ', 'документа', 'документов')}`
                }
                height={phone ? 120 : 150}
              />
              <DayChart
                points={data.checks.byDay}
                tone="ok"
                label="Проверок"
                unit={(n) => `${formatCount(n)} ${plural(n, 'проверка', 'проверки', 'проверок')}`}
                height={phone ? 90 : 110}
              />
            </Panel>

            <div className="grid content-start gap-3">
              <Panel title="Состояние выданных" note="за период">
                <StatesBar states={data.states} total={data.issued.total} />
              </Panel>
              <Panel title="Проверки" note="по QR-коду и ссылке">
                <dl className="text-sm">
                  <Row label="Проверяли документов">
                    {formatCount(data.checks.files)}
                    {data.issued.total > 0 && (
                      <span className="text-[var(--text-muted)]">
                        {' '}
                        из {formatCount(data.issued.total)} ·{' '}
                        {Math.round((data.checks.files / data.issued.total) * 100)} %
                      </span>
                    )}
                  </Row>
                  <Row label="Первых за день">{formatCount(data.checks.uniques)}</Row>
                  <Row label="Последняя проверка">
                    {data.checks.lastAt ? formatDateTime(data.checks.lastAt) : 'ещё не было'}
                  </Row>
                </dl>
                <p className="mt-3 rounded-lg bg-[var(--surface-sunken)] px-3 py-2 text-xs text-[var(--text-muted)]">
                  Считаем только факт открытия. Кто, откуда и с какого устройства — не собираем,
                  повторы за день и предпросмотры мессенджеров не считаем.
                </p>
              </Panel>
            </div>
          </div>

          <Panel
            title="По материалам"
            note={
              data.materialsTotal > data.materials.length
                ? `${data.materials.length} из ${data.materialsTotal}`
                : `${data.materialsTotal} ${plural(data.materialsTotal, 'материал', 'материала', 'материалов')}`
            }
          >
            {phone ? (
              <MaterialsList materials={data.materials} />
            ) : (
              <MaterialsTable materials={data.materials} />
            )}
          </Panel>
        </>
      )}
    </div>
  );
}

/* ---------- части экрана ---------- */

function Tile({
  icon: Icon,
  label,
  value,
  delta,
  aside,
  to,
  danger = false,
  children,
}: {
  icon: typeof FileText;
  label: string;
  value: ReactNode;
  delta?: ReactNode;
  aside?: ReactNode;
  to?: string;
  danger?: boolean;
  children?: ReactNode;
}) {
  const body = (
    <>
      <p className="flex items-center gap-1.5 text-sm text-[var(--text-muted)]">
        <Icon size={15} strokeWidth={1.7} aria-hidden />
        {label}
      </p>
      <p
        className={cn(
          'text-2xl font-semibold leading-none tabular-nums sm:text-3xl',
          danger && 'text-[var(--danger)]',
        )}
      >
        {value}
      </p>
      {children}
      {delta && <p className="mt-auto text-xs sm:text-sm">{delta}</p>}
      {aside && <div className="absolute top-3 right-3 hidden sm:block">{aside}</div>}
    </>
  );
  const cls =
    'relative flex min-h-24 min-w-0 flex-col gap-1.5 rounded-[var(--radius-card)] bg-[var(--surface)] px-3 pt-3 pb-2.5 shadow-[var(--ring-line)] sm:min-h-28 sm:px-4 sm:pt-3.5 sm:pb-3';
  return (
    <li className="contents">
      {to ? (
        <Link to={to} className={cn(cls, 'transition-colors hover:bg-[var(--row-hover)]')}>
          {body}
        </Link>
      ) : (
        <div className={cls}>{body}</div>
      )}
    </li>
  );
}

/** Стрелка к прошлому периоду: направление дублируется знаком, а не только цветом. */
function Delta({ now, prev, note }: { now: number; prev: number | null; note: string }) {
  if (prev === null) return <span className="text-[var(--text-muted)]">{note}</span>;
  if (prev === 0 && now === 0) return <span className="text-[var(--text-muted)]">{note}</span>;
  const pct = prev === 0 ? null : Math.round(((now - prev) / prev) * 100);
  const up = now > prev;
  const flat = now === prev;
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <span
        className={cn(
          'rounded-full px-1.5 py-px text-xs font-medium tabular-nums',
          flat && 'bg-[var(--surface-sunken)] text-[var(--text-muted)]',
          !flat && up && 'bg-[var(--ok-soft)] text-[var(--ok)]',
          !flat && !up && 'bg-[var(--warn-soft)] text-[var(--warn)]',
        )}
      >
        {flat ? '=' : up ? '▲' : '▼'} {pct === null ? `+${now}` : `${Math.abs(pct)} %`}
      </span>
      <span className="text-[var(--text-muted)]">{note}</span>
    </span>
  );
}

function Panel({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="min-w-0 rounded-[var(--radius-card)] bg-[var(--surface)] p-4 shadow-[var(--ring-line)]">
      <header className="mb-2 flex items-baseline gap-3">
        <h3 className="text-base font-medium">{title}</h3>
        {note && <span className="ml-auto text-xs text-[var(--text-muted)]">{note}</span>}
      </header>
      {children}
    </section>
  );
}

function LegendItem({ tone, children }: { tone: 'accent' | 'ok'; children: ReactNode }) {
  return (
    <span className="flex items-center gap-1.5">
      <i
        className={cn(
          'inline-block size-2.5 rounded-sm',
          tone === 'ok' ? 'bg-[var(--ok)]' : 'bg-[var(--accent)]',
        )}
        aria-hidden
      />
      {children}
    </span>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-[var(--line)] py-1.5 last:border-b-0">
      <dt className="text-[var(--text-muted)]">{label}</dt>
      <dd className="text-right font-medium tabular-nums">{children}</dd>
    </div>
  );
}

const STATES: { key: keyof Summary['states']; label: string; color: string }[] = [
  { key: 'valid', label: 'действительны', color: 'bg-[var(--ok)]' },
  { key: 'revoked', label: 'отозваны', color: 'bg-[var(--danger)]' },
  { key: 'replaced', label: 'заменены', color: 'bg-[var(--accent)]' },
  { key: 'expired', label: 'истекли', color: 'bg-[var(--line-strong)]' },
];

function StatesBar({ states, total }: { states: Summary['states']; total: number }) {
  if (total === 0)
    return <p className="text-sm text-[var(--text-muted)]">Выпуска за период не было.</p>;
  return (
    <>
      <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full" aria-hidden>
        {STATES.filter((s) => states[s.key] > 0).map((s) => (
          <i
            key={s.key}
            className={cn('block h-full', s.color)}
            style={{ width: `${(states[s.key] / total) * 100}%` }}
          />
        ))}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-[var(--text-muted)]">
        {STATES.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5">
            <i className={cn('inline-block size-2 rounded-full', s.color)} aria-hidden />
            <b className="font-medium text-[var(--text)] tabular-nums">
              {formatCount(states[s.key])}
            </b>{' '}
            {s.label}
          </li>
        ))}
      </ul>
    </>
  );
}

function materialLink(m: SummaryMaterial) {
  return m.documentId ? `/registry?documentId=${m.documentId}` : '/registry';
}

function MaterialsTable({ materials }: { materials: SummaryMaterial[] }) {
  if (materials.length === 0)
    return <p className="text-sm text-[var(--text-muted)]">Пока пусто.</p>;
  const most = Math.max(1, ...materials.map((m) => m.issued));
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-[var(--text-muted)]">
            <th className="py-1.5 pr-2 font-medium">Материал</th>
            <th className="py-1.5 pr-2 font-medium">Мероприятие</th>
            <th className="py-1.5 pr-2 text-right font-medium">Выпущено</th>
            <th className="w-[14%] py-1.5 pr-2" aria-hidden />
            <th className="py-1.5 pr-2 text-right font-medium">Проверок</th>
            <th className="py-1.5 pr-2 text-right font-medium">Проверяли</th>
            <th className="py-1.5 text-right font-medium">Письма</th>
          </tr>
        </thead>
        <tbody>
          {materials.map((m) => (
            <tr
              key={m.documentId ?? 'none'}
              className="border-t border-[var(--line)] hover:bg-[var(--row-hover)]"
            >
              <td className="py-2 pr-2">
                <Link to={materialLink(m)} className="font-medium hover:underline">
                  {m.title}
                </Link>
              </td>
              <td className="py-2 pr-2 text-[var(--text-muted)]">{m.eventName}</td>
              <td className="py-2 pr-2 text-right tabular-nums">{formatCount(m.issued)}</td>
              <td className="py-2 pr-2">
                <div
                  className="h-1.5 min-w-16 overflow-hidden rounded-full bg-[var(--surface-sunken)]"
                  aria-hidden
                >
                  <div
                    className="h-full rounded-full bg-[var(--accent)]"
                    style={{ width: `${(m.issued / most) * 100}%` }}
                  />
                </div>
              </td>
              <td className="py-2 pr-2 text-right tabular-nums">{formatCount(m.checks)}</td>
              <td className="py-2 pr-2 text-right tabular-nums text-[var(--text-muted)]">
                {m.issued > 0 ? `${Math.round((m.checkedFiles / m.issued) * 100)} %` : '—'}
              </td>
              <td className="py-2 text-right tabular-nums text-[var(--text-muted)]">
                {m.sent > 0 ? `${Math.round((m.delivered / m.sent) * 100)} %` : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MaterialsList({ materials }: { materials: SummaryMaterial[] }) {
  if (materials.length === 0)
    return <p className="text-sm text-[var(--text-muted)]">Пока пусто.</p>;
  const most = Math.max(1, ...materials.map((m) => m.issued));
  return (
    <ul>
      {materials.map((m) => (
        <li key={m.documentId ?? 'none'} className="border-t border-[var(--line)] first:border-t-0">
          <Link to={materialLink(m)} className="flex items-center gap-3 py-2.5">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{m.title}</span>
              <span
                className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-[var(--surface-sunken)]"
                aria-hidden
              >
                <span
                  className="block h-full rounded-full bg-[var(--accent)]"
                  style={{ width: `${(m.issued / most) * 100}%` }}
                />
              </span>
            </span>
            <span className="shrink-0 text-right text-sm tabular-nums">
              {formatCount(m.issued)}
              <span className="block text-xs text-[var(--text-muted)]">
                {formatCount(m.checks)} {plural(m.checks, 'проверка', 'проверки', 'проверок')}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
