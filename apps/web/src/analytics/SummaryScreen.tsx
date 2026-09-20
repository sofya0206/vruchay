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
import { Badge } from '../ui/Badge';
import { Card } from '../ui/Card';
import { ErrorState } from '../ui/ErrorState';
import { NextAction } from '../ui/NextAction';
import { Select } from '../ui/Select';
import { SkeletonTiles } from '../ui/Skeleton';
import { Stat } from '../ui/Stat';
import { TBody, THead, Table, Td, Th, Tr } from '../ui/Table';
import { Segmented } from '../ui/Tabs';
import { cn } from '../ui/cn';
import { usePhone } from '../ui/useMediaQuery';
import { plural, formatDate } from '../registry/registry-format';
import { formatCount } from './analytics-format';
import { DiscussTermsLink } from '../billing/DiscussTermsLink';
import { DayChart, Sparkline, type ChartTone } from './DayChart';

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
      <Segmented
        label="Период"
        value={period}
        onChange={onPeriod}
        items={PERIOD_ITEMS.map((p) => ({ id: p.id, label: phone ? p.short : p.label }))}
        stretch={phone}
      />
      <Select
        compact={!phone}
        value={documentId}
        onChange={onDocument}
        options={materialOptions}
        placeholder="Все материалы"
        className={phone ? 'w-full' : 'w-64'}
        aria-label="Материал"
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

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Выпущено"
          value={formatCount(data.issued.total)}
          hint={<Delta now={data.issued.total} prev={data.issued.prev} note={PERIOD_NOTE[period]} />}
          aside={<Sparkline points={data.issued.byDay} />}
          to={documentId ? `/registry?documentId=${documentId}` : '/registry'}
        />
        <Stat
          label={phone ? 'Проверок' : 'Проверок по QR'}
          value={formatCount(data.checks.total)}
          hint={
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
          aside={<Sparkline points={data.checks.byDay} tone="muted" />}
        />
        <Stat
          label={phone ? 'Письма' : 'Письма доставлены'}
          value={deliveredShare === null ? '—' : formatCount(deliveredShare)}
          unit={deliveredShare === null ? undefined : '%'}
          aside={<Mail size={16} strokeWidth={1.75} aria-hidden className="text-muted" />}
          hint={
            data.mail.sent === 0 ? (
              'Писем за период не было'
            ) : (
              <>
                {formatCount(data.mail.delivered)} из {formatCount(data.mail.sent)}
                {data.mail.undelivered > 0 && (
                  <>
                    {' '}
                    · <span className="text-danger">{data.mail.undelivered} не дошло</span>
                  </>
                )}
              </>
            )
          }
          to="/mailing"
        />
        <Stat
          label={
            phone ? 'Осталось' : u?.source === 'trial' ? 'Осталось на пробе' : 'Осталось по плану'
          }
          value={unlimited ? '∞' : formatCount(u.left ?? 0)}
          unit={unlimited ? undefined : `из ${formatCount(u.limit ?? 0)}`}
          tone={usageTone === 'bad' ? 'danger' : 'default'}
          aside={<CreditCard size={16} strokeWidth={1.75} aria-hidden className="text-muted" />}
          hint={
            u?.expired ? (
              <>
                Срок плана закончился · <DiscussTermsLink>обсудим продление</DiscussTermsLink>
              </>
            ) : (
              <>
                {u?.planName}
                {u?.endsAt && !u.neverExpires ? ` · до ${formatDate(u.endsAt)}` : ''}
              </>
            )
          }
          to="/settings/billing"
        >
          {!unlimited && (
            <div
              role="progressbar"
              aria-label="Израсходовано по плану"
              aria-valuenow={usedShare}
              aria-valuemin={0}
              aria-valuemax={100}
              className="h-1.5 overflow-hidden rounded-full bg-sunken"
            >
              <div
                className={cn(
                  'h-full rounded-full',
                  usageTone === 'ok' && 'bg-accent',
                  usageTone === 'warn' && 'bg-warn',
                  usageTone === 'bad' && 'bg-danger',
                )}
                style={{ width: `${usedShare}%` }}
              />
            </div>
          )}
        </Stat>
      </div>

      {empty ? (
        <Card padding="none">
          {period === 'all' ? (
            <NextAction
              compact
              icon={FileText}
              title="Выпустите первые документы"
              text="Сводка наполнится сама: выпущенные документы появятся здесь сразу, проверки — когда кто-то откроет QR-код на выданном."
              primary={{ label: 'К документам', to: '/documents' }}
            />
          ) : (
            <NextAction
              compact
              icon={QrCode}
              title="Выберите другой период"
              text="За это время не было ни одного выпуска и ни одной проверки."
              primary={{ label: 'Показать всё время', onClick: () => onPeriod('all') }}
            />
          )}
        </Card>
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
              <div className="mb-1 flex gap-4 text-xs text-muted">
                <LegendItem tone="accent">Выпущено</LegendItem>
                <LegendItem tone="muted">Проверок</LegendItem>
              </div>
              <DayChart
                points={data.issued.byDay}
                label="Выпущено"
                unit={(n) => `${formatCount(n)} ${plural(n, 'документ', 'документа', 'документов')}`}
                height={phone ? 120 : 150}
              />
              <DayChart
                points={data.checks.byDay}
                tone="muted"
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
                      <span className="text-muted">
                        {' '}
                        из {formatCount(data.issued.total)} ·{' '}
                        {Math.round((data.checks.files / data.issued.total) * 100)} %
                      </span>
                    )}
                  </Row>
                  <Row label="Первых за день">{formatCount(data.checks.uniques)}</Row>
                  <Row label="Последняя проверка">
                    {data.checks.lastAt ? shortDateTime(data.checks.lastAt) : 'ещё не было'}
                  </Row>
                </dl>
                <p className="mt-3 rounded-control bg-sunken px-3 py-2 text-xs text-muted">
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
            <MaterialsTable materials={data.materials} />
          </Panel>
        </>
      )}
    </div>
  );
}

/* ---------- части экрана ---------- */

/** «19.09.2026, 21:28» — коротко, чтобы влезало в строку на телефоне. */
function shortDateTime(iso: string): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  return `${formatDate(iso)}, ${time}`;
}

/** Стрелка к прошлому периоду: направление дублируется знаком, а не только цветом. */
function Delta({ now, prev, note }: { now: number; prev: number | null; note: string }) {
  if (prev === null || (prev === 0 && now === 0)) return <>{note}</>;
  const pct = prev === 0 ? null : Math.round(((now - prev) / prev) * 100);
  const up = now > prev;
  const flat = now === prev;
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <Badge size="sm" tone={flat ? 'neutral' : up ? 'ok' : 'warn'} className="tabular">
        {flat ? '=' : up ? '▲' : '▼'} {pct === null ? `+${now}` : `${Math.abs(pct)} %`}
      </Badge>
      <span>{note}</span>
    </span>
  );
}

/** Карточка сводки: название слева, справа — за какой отрезок посчитано. */
function Panel({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <Card
      padding="sm"
      className="min-w-0"
      title={title}
      action={note ? <span className="shrink-0 text-xs text-muted">{note}</span> : undefined}
    >
      {children}
    </Card>
  );
}

const LEGEND: Record<ChartTone, string> = { accent: 'bg-accent', muted: 'bg-muted' };

function LegendItem({ tone, children }: { tone: ChartTone; children: ReactNode }) {
  return (
    <span className="flex items-center gap-1.5">
      <i className={cn('inline-block size-2.5 rounded-sm', LEGEND[tone])} aria-hidden />
      {children}
    </span>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line py-1.5 last:border-b-0">
      <dt className="text-muted">{label}</dt>
      <dd className="tabular text-right font-medium">{children}</dd>
    </div>
  );
}

/* Цвета состояний — те же, что у меток в таблице реестра: одно состояние
   не должно быть зелёным в одном месте и синим в другом. */
const STATES: { key: keyof Summary['states']; label: string; color: string }[] = [
  { key: 'valid', label: 'действительны', color: 'bg-ok' },
  { key: 'revoked', label: 'отозваны', color: 'bg-danger' },
  { key: 'replaced', label: 'заменены', color: 'bg-warn' },
  { key: 'expired', label: 'истекли', color: 'bg-line-strong' },
];

function StatesBar({ states, total }: { states: Summary['states']; total: number }) {
  if (total === 0) return <p className="text-sm text-muted">Выпуска за период не было.</p>;
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
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
        {STATES.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5">
            <i className={cn('inline-block size-2 rounded-full', s.color)} aria-hidden />
            <b className="tabular font-medium text-ink">{formatCount(states[s.key])}</b> {s.label}
          </li>
        ))}
      </ul>
    </>
  );
}

function materialLink(m: SummaryMaterial) {
  return m.documentId ? `/registry?documentId=${m.documentId}` : '/registry';
}

function share(part: number, whole: number): string {
  return whole > 0 ? `${Math.round((part / whole) * 100)} %` : '—';
}

/** Полоска доли от самого крупного материала — чтобы сравнивать глазом, не читая числа. */
function ShareBar({ value, most, className }: { value: number; most: number; className?: string }) {
  return (
    <span className={cn('block h-1.5 min-w-16 overflow-hidden rounded-full bg-sunken', className)} aria-hidden>
      <span className="block h-full rounded-full bg-accent" style={{ width: `${(value / most) * 100}%` }} />
    </span>
  );
}

function MaterialsTable({ materials }: { materials: SummaryMaterial[] }) {
  if (materials.length === 0) return <p className="text-sm text-muted">Пока пусто.</p>;
  const most = Math.max(1, ...materials.map((m) => m.issued));
  return (
    <Table
      dense
      stickyHeader={false}
      caption="Выпуск, проверки и письма по материалам"
      cards={<MaterialsList materials={materials} most={most} />}
    >
      <THead>
        <Tr>
          <Th>Материал</Th>
          <Th>Мероприятие</Th>
          <Th align="right">Выпущено</Th>
          <Th width="14%">
            <span className="sr-only">Доля от самого крупного</span>
          </Th>
          <Th align="right">Проверок</Th>
          <Th align="right">Проверяли</Th>
          <Th align="right">Письма</Th>
        </Tr>
      </THead>
      <TBody>
        {materials.map((m) => (
          <Tr key={m.documentId ?? 'none'}>
            <Td>
              <Link to={materialLink(m)} className="font-medium hover:underline">
                {m.title}
              </Link>
            </Td>
            <Td className="text-muted">{m.eventName}</Td>
            <Td numeric align="right">
              {formatCount(m.issued)}
            </Td>
            <Td>
              <ShareBar value={m.issued} most={most} />
            </Td>
            <Td numeric align="right">
              {formatCount(m.checks)}
            </Td>
            <Td numeric align="right" className="text-muted">
              {share(m.checkedFiles, m.issued)}
            </Td>
            <Td numeric align="right" className="text-muted">
              {share(m.delivered, m.sent)}
            </Td>
          </Tr>
        ))}
      </TBody>
    </Table>
  );
}

/** Те же материалы списком — для телефона. */
function MaterialsList({ materials, most }: { materials: SummaryMaterial[]; most: number }) {
  return (
    <ul className="divide-y divide-line">
      {materials.map((m) => (
        <li key={m.documentId ?? 'none'}>
          <Link to={materialLink(m)} className="flex items-center gap-3 py-2.5">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{m.title}</span>
              <ShareBar value={m.issued} most={most} className="mt-1.5" />
            </span>
            <span className="tabular shrink-0 text-right text-sm">
              {formatCount(m.issued)}
              <span className="block text-xs text-muted">
                {formatCount(m.checks)} {plural(m.checks, 'проверка', 'проверки', 'проверок')}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
