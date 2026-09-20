import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { FileCheck, Search, X } from 'lucide-react';
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
import { Card, CardHeader } from '../ui/Card';
import { Input, StatusChip } from '../ui/Field';
import { IconButton } from '../ui/IconButton';
import { NextAction } from '../ui/NextAction';
import { SkeletonRows } from '../ui/Skeleton';
import { Segmented } from '../ui/Tabs';
import { TBody, Td, Th, THead, Table, Tr } from '../ui/Table';
import { cn } from '../ui/cn';
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
 * него — лишний шаг. За всем найденным целиком — ссылка в заголовке,
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

  /* На телефоне — карточками. Таблица в 736 точек там прокручивалась
     вбок, и «Состояние» с «Письмом» — то, ради чего организатор
     и смотрит реестр на мероприятии, — оставались за краем. */
  const cards = (
    <ul className="divide-y divide-line">
      {rows.map((row) => (
        <li key={row.fileId}>
          <Link to={searchPath(row.name)} className="flex flex-col gap-1.5 px-4 py-3 active:bg-sunken">
            <span className="flex items-start justify-between gap-3">
              <span className="min-w-0">
                <span className="block truncate font-medium">{row.name}</span>
                <span className="block truncate text-xs text-muted">
                  {row.documentTitle}
                  {row.eventName ? ` · ${row.eventName}` : ''}
                </span>
              </span>
              <StatusChip tone={stateTone(row)}>{stateLabel(row)}</StatusChip>
            </span>
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
              <StatusChip tone={mailTone(row.mail?.status)}>{mailLabel(row.mail?.status)}</StatusChip>
              <span className="tabular">{formatDate(row.issuedAt)}</span>
              <span className="tabular">
                {row.verifyCount} {plural(row.verifyCount, 'проверка', 'проверки', 'проверок')}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );

  return (
    <Card padding="none" className="overflow-hidden">
      <CardHeader
        className="mb-0 px-4 pt-4 pb-3"
        title="Реестр выданного"
        count={t?.issued ?? null}
        to={registryPath(filters)}
        linkLabel={search || tab ? 'Всё найденное' : 'Весь реестр'}
      />
      <div className="flex flex-wrap items-center gap-2 border-y border-line px-4 py-2.5">
        <form onSubmit={onSubmit} role="search" className="relative min-w-56 flex-1">
          <Search
            size={16}
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted"
          />
          <Input
            compact
            data-tour="registry-search"
            className="pr-9 pl-8"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Фамилия, почта или код"
            aria-label="Найти в реестре выданного"
            autoComplete="off"
          />
          {(query || search) && (
            <IconButton
              size="sm"
              label="Очистить поиск"
              onClick={clear}
              className="absolute top-1/2 right-0 -translate-y-1/2"
            >
              <X size={16} />
            </IconButton>
          )}
        </form>
        <Segmented
          label="Состояние"
          value={tab}
          onChange={setTab}
          items={TABS.map((item) => ({ id: item.id, label: item.label, count: counts[item.id] ?? null }))}
          className="max-md:w-full"
        />
      </div>

      {registry.isPending ? (
        <SkeletonRows rows={4} label="Загружаем последние выданные" />
      ) : rows.length === 0 ? (
        search ? (
          <NextAction
            compact
            icon={Search}
            title="Попробуйте другой запрос"
            text={`По запросу «${search}» ничего не нашлось${tab ? ' в этом состоянии' : ''}`}
            secondary={{ label: 'Сбросить поиск', onClick: clear }}
          />
        ) : tab ? (
          <NextAction
            compact
            title="В этом состоянии документов нет"
            secondary={{ label: 'Показать все', onClick: () => setTab('') }}
          />
        ) : (
          <NextAction
            compact
            icon={FileCheck}
            title="Выпустите первые документы"
            text="Выданные появятся здесь сразу после первого выпуска — и останутся навсегда"
            secondary={{ label: 'К документам', to: '/documents' }}
          />
        )
      ) : (
        <div className={cn('transition-opacity', stale && 'opacity-60')} aria-busy={stale}>
          <Table dense stickyHeader={false} caption="Последние выданные документы" cards={cards}>
            {/* Ширины заданы, иначе длинная фамилия растягивает свою колонку,
                и «Состояние» с «Проверок» уезжают за край карточки. */}
            <THead>
              <tr>
                <Th width="28%">Получатель</Th>
                <Th width="20%">Документ</Th>
                <Th width="15%">Выдан</Th>
                <Th width="14%">Письмо</Th>
                <Th width="13%">Состояние</Th>
                <Th width="10%" align="right">
                  Проверок
                </Th>
              </tr>
            </THead>
            <TBody>
              {rows.map((row) => (
                <Tr key={row.fileId}>
                  <Td className="max-w-0">
                    <Link to={searchPath(row.name)} className="block truncate font-medium">
                      {row.name}
                    </Link>
                    <span className="block truncate text-xs text-muted">{row.email || 'без адреса'}</span>
                  </Td>
                  <Td className="max-w-0">
                    <span className="block truncate">{row.documentTitle}</span>
                    {row.eventName && <span className="block truncate text-xs text-muted">{row.eventName}</span>}
                  </Td>
                  <Td className="max-w-0 whitespace-nowrap" numeric>
                    <span className="block">{formatDate(row.issuedAt)}</span>
                    {/* Старые коды — UUID на 36 знаков; целиком он есть в реестре. */}
                    <span className="block truncate font-mono text-xs text-muted" title={row.code}>
                      {row.code}
                    </span>
                  </Td>
                  <Td>
                    <StatusChip tone={mailTone(row.mail?.status)}>{mailLabel(row.mail?.status)}</StatusChip>
                  </Td>
                  <Td>
                    <StatusChip tone={stateTone(row)}>{stateLabel(row)}</StatusChip>
                  </Td>
                  <Td align="right" numeric>
                    {row.verifyCount}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
          {total > rows.length && (
            <p className="border-t border-line px-4 py-2 text-xs text-muted">
              Показаны {rows.length} из {total} ·{' '}
              <Link to={registryPath(filters)} className="text-accent underline-offset-4 hover:underline">
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
