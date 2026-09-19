import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import {
  emptyFilters,
  filtersToQuery,
  useRegistry,
  useRegistryAnalytics,
  type FileState,
} from '../api/registry';
import {
  formatDate,
  mailLabel,
  mailTone,
  stateLabel,
  stateTone,
} from '../registry/registry-format';
import { cn } from '../ui/cn';
import { Input, StatusChip } from '../ui/Field';
import { Card, Empty } from './Block';
import { plural } from './format';

const LAST_SHOWN = 6;

/** Пауза после последней буквы, прежде чем спрашивать сервер. */
const DEBOUNCE_MS = 250;

type Tab = '' | Extract<FileState, 'valid' | 'revoked' | 'replaced'>;

const TABS: { id: Tab; label: string }[] = [
  { id: '', label: 'Все' },
  { id: 'valid', label: 'Действительны' },
  { id: 'revoked', label: 'Отозваны' },
  { id: 'replaced', label: 'Заменены' },
];

/**
 * Реестр — тело главной.
 *
 * Последние выданные таблицей, а не карточками: у строки шесть сведений,
 * и сравнивать их человек будет по столбцам. Быстрые отборы по состоянию
 * со счётчиками стоят прямо над таблицей: «Отозваны 2» читается как дело,
 * а не как пункт в выпадающем списке.
 *
 * Поиск живой и никуда не уводит: совпадения встают под строкой с первой
 * буквы, Enter применяет набранное сразу, не дожидаясь паузы. «Найдите
 * грамоту Ивановой» — вопрос на десять секунд, и переход в раздел ради
 * него — лишний шаг. За всем найденным целиком — стрелка в заголовке,
 * она несёт с собой и слово, и отбор.
 *
 * Счётчики считаются по тому же поиску, что и таблица, — иначе над
 * тремя найденными Ивановыми стояло бы «Все 50».
 */
export function RegistryBlock() {
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<Tab>('');
  const filters = { ...emptyFilters, search, state: tab };
  const registry = useRegistry(filters, 0, LAST_SHOWN);
  const totals = useRegistryAnalytics({ ...emptyFilters, search }, true);

  useEffect(() => {
    const id = setTimeout(() => setSearch(query.trim()), DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [query]);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSearch(query.trim());
  }

  // Ответ на прежний запрос стоит, пока считается новый (placeholderData):
  // приглушаем его, чтобы совпадения по «Ива» не приняли за «Иван».
  const stale = registry.isFetching && registry.data !== undefined;

  function clear() {
    setQuery('');
    setSearch('');
  }

  const rows = registry.data?.items ?? [];
  const total = registry.data?.total ?? 0;
  const t = totals.data;
  const counts: Record<Tab, number | undefined> = {
    '': t?.issued,
    valid: t ? t.issued - t.revoked - t.replaced - t.expired : undefined,
    revoked: t?.revoked,
    replaced: t?.replaced,
  };

  return (
    <Card
      title="Реестр выданного"
      count={t ? `${t.issued}` : undefined}
      to={registryPath(filters)}
      linkLabel={search || tab ? 'Всё найденное в реестре' : 'Весь реестр'}
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--line)] px-4 py-2.5">
        <form onSubmit={onSubmit} role="search" className="flex min-w-60 flex-1 gap-2">
          <div className="relative flex-1">
            <Search
              size={16}
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[var(--text-muted)]"
            />
            <Input
              className="pl-9 pr-9 text-sm"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Фамилия, почта или проверочный код"
              aria-label="Найти в реестре выданного"
              autoComplete="off"
            />
            {(query || search) && (
              <button
                type="button"
                onClick={clear}
                aria-label="Очистить поиск"
                className="absolute top-1/2 right-2 grid size-6 -translate-y-1/2 place-items-center rounded text-[var(--text-muted)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text)] pointer-coarse:right-0.5 pointer-coarse:size-10"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </form>
        <div role="tablist" aria-label="Состояние" className="flex gap-1 max-md:-mx-1 max-md:w-full max-md:overflow-x-auto max-md:px-1 md:flex-wrap">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              onClick={() => setTab(item.id)}
              className={cn(
                'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-sm transition-colors pointer-coarse:h-10',
                tab === item.id
                  ? 'bg-[var(--surface)] font-medium text-[var(--text)] ring-1 ring-[var(--line-strong)]'
                  : 'text-[var(--text-muted)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text)]',
              )}
            >
              {item.label}
              {counts[item.id] !== undefined && (
                <span
                  className={cn(
                    'tabular-nums',
                    item.id === 'revoked' && counts.revoked ? 'text-[var(--danger)]' : 'text-[var(--text-muted)]',
                  )}
                >
                  {counts[item.id]}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {registry.isPending ? (
        <Empty>Загружаем последние выданные…</Empty>
      ) : rows.length === 0 ? (
        <Empty>
          {search
            ? `По запросу «${search}» ничего не нашлось${tab ? ' в этом состоянии' : ''}.`
            : tab
              ? 'В этом состоянии документов нет.'
              : 'Выданных документов пока нет. Они появятся здесь сразу после первого выпуска — и останутся навсегда.'}
        </Empty>
      ) : (
        <div
          className={cn('overflow-x-auto transition-opacity', stale && 'opacity-60')}
          aria-busy={stale}
        >
          {/* На телефоне — карточками. Таблица в 736 точек там прокручивалась
              вбок, и «Состояние» с «Письмом» — то, ради чего организатор
              и смотрит реестр на мероприятии, — оставались за краем. */}
          <ul className="divide-y divide-[var(--line)] md:hidden">
            {rows.map((row) => (
              <li key={row.fileId}>
                <Link
                  to={searchPath(row.name)}
                  className="flex flex-col gap-1.5 px-4 py-3 active:bg-[var(--surface-sunken)]"
                >
                  <span className="flex items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{row.name}</span>
                      <span className="block truncate text-xs text-[var(--text-muted)]">
                        {row.documentTitle}
                        {row.eventName ? ` · ${row.eventName}` : ''}
                      </span>
                    </span>
                    <StatusChip tone={stateTone(row)}>{stateLabel(row)}</StatusChip>
                  </span>
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--text-muted)]">
                    <StatusChip tone={mailTone(row.mail?.status)}>{mailLabel(row.mail?.status)}</StatusChip>
                    <span className="tabular-nums">{formatDate(row.issuedAt)}</span>
                    <span className="tabular-nums">
                      {row.verifyCount} {plural(row.verifyCount, 'проверка', 'проверки', 'проверок')}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <table className="w-full min-w-[46rem] table-fixed border-collapse text-sm max-md:hidden">
            {/* Ширины заданы, иначе длинная фамилия растягивает свою колонку,
                и «Состояние» с «Проверок» уезжают за край карточки. */}
            <colgroup>
              <col className="w-[28%]" />
              <col className="w-[20%]" />
              <col className="w-[15%]" />
              <col className="w-[14%]" />
              <col className="w-[13%]" />
              <col className="w-[10%]" />
            </colgroup>
            <thead>
              <tr className="text-left text-xs tracking-wide text-[var(--text-muted)] uppercase">
                <th className="px-4 py-2 font-medium">Получатель</th>
                <th className="px-3 py-2 font-medium">Документ</th>
                <th className="px-3 py-2 font-medium">Выдан</th>
                <th className="px-3 py-2 font-medium">Письмо</th>
                <th className="px-3 py-2 font-medium">Состояние</th>
                <th className="px-4 py-2 text-right font-medium">Проверок</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.fileId} className="border-t border-[var(--line)] transition-colors hover:bg-[var(--surface-sunken)]">
                  <td className="px-4 py-2.5">
                    <Link to={searchPath(row.name)} className="block truncate font-medium">
                      {row.name}
                    </Link>
                    <span className="block truncate text-xs text-[var(--text-muted)]">
                      {row.email || 'без адреса'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-[var(--text-muted)]">
                    <span className="block truncate text-[var(--text)]">{row.documentTitle}</span>
                    {row.eventName && <span className="block truncate text-xs">{row.eventName}</span>}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <span className="block tabular-nums">{formatDate(row.issuedAt)}</span>
                    {/* Старые коды — UUID на 36 знаков; целиком он есть в реестре. */}
                    <span className="block truncate font-mono text-xs text-[var(--text-muted)]" title={row.code}>
                      {row.code}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <StatusChip tone={mailTone(row.mail?.status)}>{mailLabel(row.mail?.status)}</StatusChip>
                  </td>
                  <td className="px-3 py-2.5">
                    <StatusChip tone={stateTone(row)}>{stateLabel(row)}</StatusChip>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{row.verifyCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {total > rows.length && (
            <p className="border-t border-[var(--line)] px-4 py-2 text-xs text-[var(--text-muted)]">
              Показаны {rows.length} из {total} ·{' '}
              <Link to={registryPath(filters)} className="text-[var(--accent)] underline-offset-4 hover:underline">
                открыть всё в реестре
              </Link>
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

/** Адрес реестра с тем же отбором, что стоит на главной. */
function registryPath(filters: typeof emptyFilters): string {
  const query = filtersToQuery(filters);
  return query ? `/registry?${query}` : '/registry';
}

export function searchPath(query: string): string {
  return registryPath({ ...emptyFilters, search: query.trim() });
}
