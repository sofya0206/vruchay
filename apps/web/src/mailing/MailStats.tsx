import { useState } from 'react';
import { ChartColumn, FileText, Mail } from 'lucide-react';
import { EmptyState } from '../ui/EmptyState';
import { ErrorState } from '../ui/ErrorState';
import { SkeletonTiles } from '../ui/Skeleton';
import { Tabs } from '../ui/Tabs';
import { cn } from '../ui/cn';
import { useMailStats, type Funnel, type StatsDay, type StatsSource } from './api';
import { dayLabel, groupByEvent, share } from './mail-stats';

/**
 * Сводка по письмам за отрезок: сколько ушло, дошло, прочитано и не дошло.
 *
 * Отрезок выбирается в панели раздела (см. MailingPage) и приходит сюда
 * готовыми датами. Цифры — только счётчики: адреса живут в журнале писем.
 */
export function MailStats({ period }: { period: { from: string; to: string } }) {
  const stats = useMailStats(period);

  if (stats.isPending) return <SkeletonTiles label="Считаем" />;
  if (stats.isError) {
    return (
      <ErrorState
        onRetry={() => void stats.refetch()}
        retrying={stats.isFetching}
        code={(stats.error as Error).message}
      />
    );
  }

  const { totals, days, sources } = stats.data;

  if (totals.total === 0) {
    return (
      <EmptyState icon={ChartColumn} title="Писем за этот отрезок нет">
        Выберите отрезок длиннее
      </EmptyState>
    );
  }

  return (
    <div className="space-y-8">
      <Tiles totals={totals} />
      <DaysChart days={days} />
      <Sources sources={sources} />
    </div>
  );
}

// ─── Плитки ──────────────────────────────────────────────────────────────────

function Tiles({ totals }: { totals: Funnel }) {
  const tiles: { label: string; value: number; note: string; tone?: 'accent' | 'danger' }[] = [
    {
      label: 'Отправлено',
      value: totals.sent,
      note: totals.queued ? `+${fmt(totals.queued)} в очереди` : '',
    },
    { label: 'Доставлено', value: totals.delivered, note: share(totals.delivered, totals) },
    {
      label: 'Прочитано',
      value: totals.opened,
      note: share(totals.opened, totals),
      tone: 'accent',
    },
    { label: 'Не дошло', value: totals.failed, note: share(totals.failed, totals), tone: 'danger' },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {tiles.map((tile) => (
        <div key={tile.label} className="card p-5">
          <p className="text-sm text-[var(--text-muted)]">{tile.label}</p>
          <p
            className={cn(
              'mt-1 text-3xl tabular-nums',
              tile.tone === 'accent' && 'text-[var(--accent)]',
              tile.tone === 'danger' && tile.value > 0 && 'text-[var(--danger)]',
            )}
          >
            {fmt(tile.value)}
          </p>
          <p className="mt-1 h-5 text-sm text-[var(--text-muted)] tabular-nums">{tile.note}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Ряд по дням ─────────────────────────────────────────────────────────────

/**
 * Части столбца снизу вверх. Вместе дают все письма дня: прочитанные,
 * ушедшие без прочтения, не дошедшие и ещё стоящие в очереди.
 *
 * Серый у «не прочитано» намеренно нейтральный: это не плохо и не хорошо,
 * часть почтовых программ не показывает картинки, и прочтение не видно.
 */
const SEGMENTS: {
  key: 'opened' | 'unread' | 'failed' | 'queued';
  label: string;
  color: string;
}[] = [
  { key: 'opened', label: 'Прочитано', color: 'var(--accent)' },
  { key: 'unread', label: 'Не прочитано', color: 'var(--line-strong)' },
  { key: 'failed', label: 'Не дошло', color: 'var(--danger)' },
  // Очередь — состояние на минуты: штриховка вместо сплошного цвета,
  // её видно в обеих темах и не спутать с серым «не прочитано».
  {
    key: 'queued',
    label: 'В очереди',
    color: 'repeating-linear-gradient(135deg, var(--line-strong) 0 2px, transparent 2px 5px)',
  },
];

function parts(day: Funnel) {
  return {
    opened: day.opened,
    unread: Math.max(0, day.total - day.queued - day.failed - day.opened),
    failed: day.failed,
    queued: day.queued,
  };
}

const CHART_H = 180;

function DaysChart({ days }: { days: StatsDay[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...days.map((d) => d.total), 1);
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1];
  // Подпись дня — через равный шаг, чтобы подписи не налезали друг на друга.
  // Шаг отсчитывается от конца: сегодняшний день подписан всегда.
  const labelEvery = Math.ceil(days.length / 8);
  const current = hover === null ? null : days[hover];

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-lg font-medium">По дням</h2>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-[var(--text-muted)]">
          {SEGMENTS.map((s) => (
            <li key={s.key} className="flex items-center gap-1.5">
              <span
                className="size-2.5 rounded-[3px]"
                style={{ background: s.color }}
                aria-hidden
              />
              {s.label}
            </li>
          ))}
        </ul>
      </div>

      <div className="card relative p-4 pl-12">
        {/* Сетка и шкала: бледные, чтобы не спорить со столбцами. */}
        <div className="relative" style={{ height: CHART_H }} onMouseLeave={() => setHover(null)}>
          {ticks.map((tick) => (
            <div
              key={tick}
              className="absolute right-0 left-0 border-t border-[var(--line)]"
              style={{ bottom: (tick / top) * CHART_H }}
            >
              <span className="absolute -top-2.5 -left-10 w-8 text-right text-xs text-[var(--text-muted)] tabular-nums">
                {fmt(tick)}
              </span>
            </div>
          ))}

          <div className="absolute inset-0 flex items-end gap-[2px]">
            {days.map((day, i) => {
              const p = parts(day);
              return (
                <button
                  key={day.day}
                  type="button"
                  aria-label={`${dayLabel(day.day)}: писем ${day.total}`}
                  onMouseEnter={() => setHover(i)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                  // Мишень — вся высота колонки, а не только столбец:
                  // в невысокий столбец иначе не попасть.
                  className={cn(
                    'flex h-full min-w-0 flex-1 flex-col-reverse rounded-t-[4px] focus-visible:outline-2 focus-visible:outline-[var(--focus)]',
                    hover === i && 'bg-[var(--row-hover)]',
                  )}
                >
                  {SEGMENTS.map((s, idx) =>
                    p[s.key] > 0 ? (
                      <span
                        key={s.key}
                        className={cn('block w-full', topSegment(p, idx) && 'rounded-t-[4px]')}
                        style={{
                          height: (p[s.key] / top) * CHART_H,
                          background: s.color,
                          // Зазор цвета поверхности между частями столбца.
                          boxShadow: idx > 0 ? 'inset 0 -2px 0 var(--surface)' : undefined,
                        }}
                      />
                    ) : null,
                  )}
                </button>
              );
            })}
          </div>

          {current && hover !== null && (
            <DayTooltip day={current} left={((hover + 0.5) / days.length) * 100} />
          )}
        </div>

        <div className="mt-2 flex gap-[2px] text-xs text-[var(--text-muted)]">
          {days.map((day, i) => (
            <span
              key={day.day}
              className="min-w-0 flex-1 overflow-visible text-center whitespace-nowrap"
            >
              {(days.length - 1 - i) % labelEvery === 0 ? dayLabel(day.day) : ''}
            </span>
          ))}
        </div>
      </div>

      {/* Та же сводка таблицей — для чтения с экрана. Прячет обёртка,
          а не сама таблица: таблица не сжимается в sr-only и вытягивала
          страницу ниже рамки кабинета — колонки уезжали при прокрутке. */}
      <div className="sr-only">
        <table>
          <caption>Письма по дням</caption>
          <thead>
            <tr>
              <th>День</th>
              <th>Всего</th>
              {SEGMENTS.map((s) => (
                <th key={s.key}>{s.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {days.map((day) => {
              const p = parts(day);
              return (
                <tr key={day.day}>
                  <td>{dayLabel(day.day)}</td>
                  <td>{day.total}</td>
                  {SEGMENTS.map((s) => (
                    <td key={s.key}>{p[s.key]}</td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Верхняя непустая часть столбца скругляется, остальные — нет. */
function topSegment(p: ReturnType<typeof parts>, idx: number): boolean {
  return SEGMENTS.slice(idx + 1).every((s) => p[s.key] === 0);
}

function DayTooltip({ day, left }: { day: StatsDay; left: number }) {
  const p = parts(day);
  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute -top-2 z-10 w-44 -translate-y-full rounded-lg bg-[var(--surface-raised)] p-3 text-sm shadow-[var(--shadow-md)] ring-1 ring-[var(--line)]"
      style={{ left: `clamp(0px, calc(${left}% - 88px), calc(100% - 176px))` }}
    >
      <p className="mb-1.5 font-medium">
        {dayLabel(day.day)} · {fmt(day.total)}
      </p>
      <ul className="space-y-0.5">
        {SEGMENTS.map((s) => (
          <li key={s.key} className="flex items-center gap-2">
            <span className="size-2.5 rounded-[3px]" style={{ background: s.color }} aria-hidden />
            <span className="flex-1 text-[var(--text-muted)]">{s.label}</span>
            <span className="tabular-nums">{fmt(p[s.key])}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Круглые деления шкалы: 1-2-5 на десяток, три-четыре линии. */
function niceTicks(max: number): number[] {
  const rough = max / 3;
  const pow = 10 ** Math.floor(Math.log10(Math.max(rough, 1)));
  const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= rough) ?? pow * 10;
  const ticks: number[] = [];
  for (let t = step; t < max + step; t += step) ticks.push(t);
  return ticks;
}

// ─── Разбивка ────────────────────────────────────────────────────────────────

type SourceView = 'documents' | 'events';

function Sources({ sources }: { sources: StatsSource[] }) {
  const [view, setView] = useState<SourceView>('documents');
  const rows = view === 'events' ? groupByEvent(sources) : sources;

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-medium">Откуда письма</h2>
        <Tabs
          label="Разбивка"
          value={view}
          onChange={setView}
          items={[
            { id: 'documents', label: 'Материалы' },
            { id: 'events', label: 'Мероприятия' },
          ]}
        />
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm whitespace-nowrap">
          <thead className="text-left text-[var(--text-muted)]">
            <tr className="border-b border-[var(--line)]">
              <th className="px-3 py-2.5 font-normal">Название</th>
              <th className="px-3 py-2.5 text-right font-normal">Писем</th>
              <th className="px-3 py-2.5 font-normal">Прочитано</th>
              <th className="px-3 py-2.5 text-right font-normal">Не дошло</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line)]">
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="w-full max-w-0 px-3 py-2.5">
                  <span className="flex items-center gap-2">
                    {row.type === 'mailing' ? (
                      <Mail
                        size={15}
                        className="shrink-0 text-[var(--text-muted)]"
                        aria-label="Рассылка текстом"
                      />
                    ) : (
                      <FileText
                        size={15}
                        className="shrink-0 text-[var(--text-muted)]"
                        aria-label="Материал"
                      />
                    )}
                    <span className="truncate">{row.title || 'Без названия'}</span>
                  </span>
                  {view === 'documents' && row.eventName && (
                    <span className="block truncate pl-[23px] text-xs text-[var(--text-muted)]">
                      {row.eventName}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{fmt(row.total)}</td>
                <td className="px-3 py-2.5">
                  <ShareBar value={row.opened} funnel={row} />
                </td>
                <td
                  className={cn(
                    'px-3 py-2.5 text-right tabular-nums',
                    row.failed > 0 && 'text-[var(--danger)]',
                  )}
                >
                  {fmt(row.failed)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Доля прочтения полоской и числом: полоска сравнивает строки, число — точное. */
function ShareBar({ value, funnel }: { value: number; funnel: Funnel }) {
  const base = funnel.total - funnel.queued;
  const width = base > 0 ? (value / base) * 100 : 0;
  return (
    <span className="flex items-center gap-2">
      <span className="h-1.5 w-12 overflow-hidden rounded-full bg-[var(--surface-sunken)]">
        <span
          className="block h-full rounded-full bg-[var(--accent)]"
          style={{ width: `${width}%` }}
        />
      </span>
      <span className="w-10 tabular-nums">{share(value, funnel)}</span>
    </span>
  );
}

function fmt(n: number): string {
  return n.toLocaleString('ru-RU');
}
