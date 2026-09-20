import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  Download,
  FileSpreadsheet,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { Card, Rows } from '../ui/Card';
import { Dialog } from '../ui/Dialog';
import { ErrorState } from '../ui/ErrorState';
import { NextAction } from '../ui/NextAction';
import { PageHeader } from '../ui/PageHeader';
import { PageLayout } from '../ui/SectionLayout';
import { SkeletonRows } from '../ui/Skeleton';
import { TableSelectionBar } from '../ui/Table';
import { Segmented } from '../ui/Tabs';
import { toast } from '../ui/Toast';
import { Tooltip } from '../ui/Tooltip';
import {
  emptyFilters,
  filterForRevoke,
  filtersFromQuery,
  filtersToQuery,
  revokableByFilter,
  useRegistry,
  useRegistryAction,
  useRegistryFacets,
  type RegistryFilters as Filters,
  type RevokeTarget,
  type SkippedItem,
} from '../api/registry';
import { ApiError } from '../api/client';
import { isPeriod, type Period } from '../api/analytics';
import { AnalyticsPage } from '../analytics/AnalyticsPage';
import { SummaryScreen } from '../analytics/SummaryScreen';
import { DocumentHistory } from './DocumentHistory';
import { RegistryFilters } from './RegistryFilters';
import { RegistryTable } from './RegistryTable';
import { RevokeDialog } from './RevokeDialog';
import { plural } from './registry-format';

const PAGE_SIZE = 50;

/** Сколько документов можно переслать за раз — столько же, сколько на сервере. */
const RESEND_MAX = 50;

interface ActionResult {
  queued?: number;
  reissued?: number;
  changed?: number;
  skipped?: SkippedItem[];
}

const documents = (n: number) => `${n} ${plural(n, 'документ', 'документа', 'документов')}`;

/**
 * Реестр выданного.
 *
 * Раздел, ради которого сервис перестаёт быть одноразовым. До него готовые
 * документы жили только в письме участника и в списке заданий на выпуск:
 * через месяц после мероприятия «найдите и перешлите грамоту Ивановой»
 * означало открыть каждый материал по очереди и просмотреть глазами.
 */
export function RegistryPage() {
  /*
   * Вкладка — в адресе: `?tab=analytics`. Аналитика — не спрятанная
   * вкладка, а подстраница реестра со своим адресом: на неё ведут
   * меню учётной записи и главная, а старый `/analytics` сюда
   * перенаправляет. Отбор при переключении не сбрасывается.
   */
  const [search, setSearch] = useSearchParams();
  const tab: 'registry' | 'analytics' = search.get('tab') === 'analytics' ? 'analytics' : 'registry';
  const setTab = (next: 'registry' | 'analytics') =>
    setSearch(
      (prev) => {
        const q = new URLSearchParams(prev);
        if (next === 'analytics') q.set('tab', 'analytics');
        else q.delete('tab');
        return q;
      },
      { replace: true },
    );
  // Период сводки — в адресе: с главной сюда приходят по ссылке «за 30 дней».
  const period: Period = isPeriod(search.get('period')) ? (search.get('period') as Period) : '30d';
  const setPeriod = (next: Period) =>
    setSearch(
      (prev) => {
        const q = new URLSearchParams(prev);
        q.set('period', next);
        return q;
      },
      { replace: true },
    );
  /*
   * Отбор из адреса — только начальный.
   *
   * Ссылка «выданное по этому материалу» обязана открывать реестр уже
   * суженным: иначе человек, пришедший за грамотой Ивановой, встречает
   * все восемь тысяч выданных документов. Дальше отбор живёт своей
   * жизнью и адрес не трогает.
   */
  const [filters, setFilters] = useState<Filters>(() => filtersFromQuery(search.toString()));
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openFileId, setOpenFileId] = useState<string | null>(null);
  const [skipped, setSkipped] = useState<SkippedItem[] | null>(null);
  const [revoking, setRevoking] = useState<RevokeTarget | null>(null);
  const qc = useQueryClient();

  const facets = useRegistryFacets();
  const registry = useRegistry(filters, offset, PAGE_SIZE);

  const resend = useRegistryAction<ActionResult>('resend');
  const reissue = useRegistryAction<ActionResult>('reissue');
  const revoke = useRegistryAction<ActionResult>('revoke');
  const pending = resend.isPending || reissue.isPending || revoke.isPending;

  // Смена отбора возвращает на первую страницу: иначе человек сужает поиск
  // и видит пустоту, потому что остался на четырнадцатой странице.
  useEffect(() => {
    setOffset(0);
    setSelected(new Set());
  }, [filters]);

  const rows = registry.data?.items ?? [];
  const total = registry.data?.total ?? 0;
  const loaded = !registry.isPending && !registry.isError;
  const query = useMemo(() => filtersToQuery(filters), [filters]);
  const ids = [...selected];

  function toggle(fileId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(fileId)) next.delete(fileId);
      else next.add(fileId);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => {
      const allChecked = rows.length > 0 && rows.every((r) => prev.has(r.fileId));
      if (allChecked) return new Set();
      return new Set(rows.map((r) => r.fileId));
    });
  }

  /*
   * Итог действия — уведомлением, а не полосой над таблицей: читать его
   * дважды не нужно. Пропущенные документы открываются из уведомления
   * отдельным окном — в строку они не помещаются.
   */
  async function run(
    action: typeof resend,
    body: unknown,
    done: (result: ActionResult) => { title: string; description?: string },
    failed: string,
  ): Promise<void> {
    try {
      const result = await action.mutateAsync(body);
      const missed = result.skipped ?? [];
      const summary = done(result);
      toast({
        tone: 'ok',
        title: summary.title,
        description: missed.length > 0 ? `Пропущено: ${documents(missed.length)}` : summary.description,
        action:
          missed.length > 0 ? { label: 'Показать пропущенные', onClick: () => setSkipped(missed) } : undefined,
      });
      setSelected(new Set());
    } catch (err) {
      toast({
        tone: 'danger',
        title: failed,
        description: err instanceof ApiError ? err.message : 'Попробуйте ещё раз',
      });
    }
  }

  const archiveHref = (selectedIds: string[]) =>
    `/api/registry/archive?${[query, selectedIds.length > 0 ? `ids=${selectedIds.join(',')}` : '']
      .filter(Boolean)
      .join('&')}`;

  return (
    <PageLayout
      head={
        <PageHeader
          title="Реестр"
          count={tab === 'registry' && loaded ? total : null}
          tabs={
            <div data-tour="registry-tabs" className="max-w-full">
              <Segmented
                label="Разделы реестра"
                value={tab}
                onChange={setTab}
                items={[
                  { id: 'registry', label: 'Выданные' },
                  { id: 'analytics', label: 'Аналитика' },
                ]}
              />
            </div>
          }
        />
      }
    >
      {tab === 'analytics' ? (
        <div className="space-y-10">
          {/* Материал сводки — тот же, что в отборе реестра: из материала
              сюда приходят уже суженными. Ниже — качество и активация. */}
          <SummaryScreen
            period={period}
            documentId={filters.documentId}
            onPeriod={setPeriod}
            onDocument={(documentId) => setFilters({ ...filters, documentId })}
          />
          <AnalyticsPage />
        </div>
      ) : (
        <div className="space-y-4">
          <RegistryFilters
            value={filters}
            facets={facets.data}
            onChange={setFilters}
            onReset={() => setFilters(emptyFilters)}
          />

          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm text-muted" aria-live="polite">
              {!loaded ? '' : total > 0 ? `Найдено: ${documents(total)}` : 'Ничего не найдено'}
            </p>

            <div className="ml-auto flex flex-wrap gap-2">
              {/* Отзыв по отбору — для «утёк бланк» и «ошибка в целом протоколе»,
                  когда документов тысячи. Только по суженному отбору. */}
              {revokableByFilter(filters) && total > 0 && selected.size === 0 && (
                <Button
                  size="sm"
                  variant="danger"
                  icon={<ShieldAlert size={16} />}
                  onClick={() => setRevoking({ filter: filterForRevoke(filters) })}
                >
                  Отозвать всё найденное
                </Button>
              )}
              {/* Выгрузки — ссылки, а не кнопки: файл отдаёт сервер. Пока
                  выгружать нечего, ссылки нет вовсе — кнопка с `disabled`
                  внутри живой ссылки всё равно открывала бы пустой файл. */}
              {total > 0 && (
                <>
                  <ExportLink href={`/api/registry/export.csv${query ? `?${query}` : ''}`}>
                    <FileSpreadsheet size={16} aria-hidden /> Таблицей
                  </ExportLink>
                  <ExportLink href={archiveHref([])}>
                    <Download size={16} aria-hidden /> Скачать всё найденное
                  </ExportLink>
                </>
              )}
            </div>
          </div>

          {registry.isPending ? (
            <Card padding="none">
              <SkeletonRows rows={8} label="Открываем реестр" />
            </Card>
          ) : registry.isError ? (
            <ErrorState
              title="Реестр не открылся"
              onRetry={() => void registry.refetch()}
              retrying={registry.isFetching}
              code={String(registry.error)}
            />
          ) : rows.length === 0 ? (
            <Card padding="none">
              {query.length > 0 ? (
                <NextAction
                  compact
                  icon={Search}
                  title="Ничего не нашлось"
                  text="Попробуйте убрать часть условий или проверить написание."
                  primary={{ label: 'Сбросить отбор', onClick: () => setFilters(emptyFilters) }}
                />
              ) : (
                <NextAction
                  icon={ShieldCheck}
                  title="Выпустите первые документы"
                  text="Реестр наполняется сам: как только выпуск по материалу закончится, грамоты и сертификаты будут искаться отсюда — по фамилии, почте или проверочному коду."
                  primary={{ label: 'К документам', to: '/documents' }}
                />
              )}
            </Card>
          ) : (
            <RegistryTable
              rows={rows}
              selected={selected}
              onToggle={toggle}
              onToggleAll={toggleAll}
              onOpen={setOpenFileId}
            />
          )}

          {total > PAGE_SIZE && (
            <div className="flex items-center gap-3">
              <Button
                size="sm"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              >
                Назад
              </Button>
              <span className="tabular text-sm text-muted">
                {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} из {total.toLocaleString('ru-RU')}
              </span>
              <Button
                size="sm"
                disabled={offset + PAGE_SIZE >= total}
                onClick={() => setOffset(offset + PAGE_SIZE)}
              >
                Вперёд
              </Button>
            </div>
          )}

          <TableSelectionBar count={selected.size} onClear={() => setSelected(new Set())}>
            <Tooltip
              label={
                selected.size > RESEND_MAX
                  ? `За раз пересылаем не больше ${RESEND_MAX} писем`
                  : undefined
              }
            >
              <Button
                size="sm"
                variant="primary"
                icon={<Send size={16} />}
                disabled={pending || selected.size > RESEND_MAX}
                onClick={() =>
                  run(
                    resend,
                    { fileIds: ids },
                    (r) => ({
                      title: 'Письма поставлены в очередь',
                      description: `${r.queued ?? 0} ${plural(r.queued ?? 0, 'письмо', 'письма', 'писем')}`,
                    }),
                    'Письма не отправились',
                  )
                }
              >
                Переслать
              </Button>
            </Tooltip>
            <Button
              size="sm"
              icon={<RefreshCw size={16} />}
              disabled={pending}
              onClick={() =>
                run(
                  reissue,
                  { fileIds: ids },
                  (r) => ({
                    title: 'Перевыпуск начат',
                    description: `${documents(r.reissued ?? 0)}. Старые станут заменёнными, как только новые будут готовы.`,
                  }),
                  'Перевыпуск не начался',
                )
              }
            >
              Перевыпустить
            </Button>
            <Button
              size="sm"
              variant="danger"
              icon={<ShieldAlert size={16} />}
              disabled={pending}
              onClick={() => setRevoking({ fileIds: ids })}
            >
              Отозвать
            </Button>
            <Button
              size="sm"
              variant="ghost"
              icon={<ShieldCheck size={16} />}
              disabled={pending}
              onClick={() =>
                run(
                  revoke,
                  { fileIds: ids, revoked: false, expectedCount: ids.length },
                  (r) => ({ title: 'Проверка возвращена', description: documents(r.changed ?? 0) }),
                  'Проверка не вернулась',
                )
              }
            >
              Вернуть проверку
            </Button>
            <ExportLink href={archiveHref(ids)}>
              <Download size={16} aria-hidden /> Скачать
            </ExportLink>
          </TableSelectionBar>
        </div>
      )}

      <DocumentHistory fileId={openFileId} onClose={() => setOpenFileId(null)} />

      {revoking && (
        <RevokeDialog
          target={revoking}
          filters={filters}
          onClose={() => setRevoking(null)}
          onDone={async (changed) => {
            setRevoking(null);
            setSelected(new Set());
            toast({ tone: 'ok', title: 'Документы отозваны', description: documents(changed) });
            await Promise.all([
              qc.invalidateQueries({ queryKey: ['registry'] }),
              qc.invalidateQueries({ queryKey: ['registry-analytics'] }),
              qc.invalidateQueries({ queryKey: ['registry-detail'] }),
            ]);
          }}
        />
      )}

      {skipped && <SkippedDialog items={skipped} onClose={() => setSkipped(null)} />}
    </PageLayout>
  );
}

/** Кого действие не затронуло и почему — по строке на документ. */
function SkippedDialog({ items, onClose }: { items: SkippedItem[]; onClose: () => void }) {
  return (
    <Dialog
      title="Пропущенные документы"
      description={`Действие не затронуло ${documents(items.length)}.`}
      onClose={onClose}
      size="sm"
      footer={<Button onClick={onClose}>Понятно</Button>}
    >
      <Rows>
        {items.map((item) => (
          <li key={item.fileId} className="flex items-baseline justify-between gap-3 px-3 py-2 text-sm">
            <span className="truncate">{item.name || 'Без имени'}</span>
            <span className="shrink-0 text-muted">{item.reason}</span>
          </li>
        ))}
      </Rows>
    </Dialog>
  );
}

/** Выгрузка файла — ссылка в одежде малой вторичной кнопки: файл отдаёт сервер. */
function ExportLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="pressable inline-flex h-8 shrink-0 items-center gap-1.5 rounded-control bg-surface px-3 text-sm font-medium whitespace-nowrap text-ink ring-1 ring-line hover:bg-sunken"
    >
      {children}
    </a>
  );
}
