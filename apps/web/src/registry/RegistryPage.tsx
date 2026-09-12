import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Download, FileSpreadsheet, RefreshCw, Send, ShieldAlert, ShieldCheck } from 'lucide-react';
import { Button } from '../ui/Button';
import { Loading } from '../ui/Loading';
import { PageLayout, SectionTitle } from '../ui/SectionLayout';
import { Tabs } from '../ui/Tabs';
import { EmptyState as Empty } from '../ui/EmptyState';
import { Search } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
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
import { RevokeDialog } from './RevokeDialog';
import { ApiError } from '../api/client';
import { RegistryFilters } from './RegistryFilters';
import { RegistryTable } from './RegistryTable';
import { DocumentHistory } from './DocumentHistory';
import { AnalyticsPanel } from './AnalyticsPanel';
import { AnalyticsPage } from '../analytics/AnalyticsPage';
import { plural } from './registry-format';

const PAGE_SIZE = 50;

/** Сколько документов можно переотправить за раз — столько же, сколько на сервере. */
const RESEND_MAX = 50;

interface ActionResult {
  queued?: number;
  reissued?: number;
  changed?: number;
  skipped?: SkippedItem[];
}

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
  const [notice, setNotice] = useState<{ text: string; skipped: SkippedItem[] } | null>(null);
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

  async function run(
    action: typeof resend,
    body: unknown,
    done: (result: ActionResult) => string,
  ): Promise<void> {
    setNotice(null);
    try {
      const result = await action.mutateAsync(body);
      setNotice({ text: done(result), skipped: result.skipped ?? [] });
      setSelected(new Set());
    } catch (err) {
      setNotice({
        text: err instanceof ApiError ? err.message : 'Не получилось — попробуйте ещё раз',
        skipped: [],
      });
    }
  }

  return (
    <PageLayout
      head={<SectionTitle>Реестр</SectionTitle>}
      tools={
        <Tabs
          label="Разделы реестра"
          value={tab}
          onChange={setTab}
          items={[
            { id: 'registry', label: 'Выданные документы' },
            { id: 'analytics', label: 'Аналитика' },
          ]}
        />
      }
    >
      <RegistryFilters
        value={filters}
        facets={facets.data}
        onChange={setFilters}
        onReset={() => setFilters(emptyFilters)}
      />

      {notice && (
        <div className="mt-4 rounded-xl bg-[var(--surface-sunken)] p-4 text-sm">
          <p>{notice.text}</p>
          {notice.skipped.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs text-[var(--text-muted)]">
              {notice.skipped.slice(0, 10).map((item) => (
                <li key={item.fileId}>
                  {item.name || 'Без имени'} — {item.reason}
                </li>
              ))}
              {notice.skipped.length > 10 && <li>и ещё {notice.skipped.length - 10}</li>}
            </ul>
          )}
        </div>
      )}

      {tab === 'analytics' ? (
        <div className="mt-6 space-y-10">
          {/* Сначала по текущему отбору — за этим сюда и приходят из
              материала; ниже — по организации целиком. */}
          <AnalyticsPanel filters={filters} active={tab === 'analytics'} />
          <AnalyticsPage />
        </div>
      ) : (
        <>
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <p className="text-sm text-[var(--text-muted)]">
              {total > 0
                ? `Найдено ${total.toLocaleString('ru-RU')} ${plural(total, 'документ', 'документа', 'документов')}` +
                  (selected.size > 0 ? `, отмечено ${selected.size}` : '')
                : 'Ничего не найдено'}
            </p>

            <div className="ml-auto flex flex-wrap gap-2">
              {/* Отзыв по отбору — для «утёк бланк» и «ошибка в целом протоколе»,
                  когда документов тысячи. Только по суженному отбору. */}
              {revokableByFilter(filters) && total > 0 && selected.size === 0 && (
                <Button
                  size="sm"
                  variant="danger"
                  icon={<ShieldAlert size={14} />}
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
                    <FileSpreadsheet size={14} /> Таблицей
                  </ExportLink>
                  <ExportLink
                    href={`/api/registry/archive?${[query, ids.length > 0 ? `ids=${ids.join(',')}` : '']
                      .filter(Boolean)
                      .join('&')}`}
                  >
                    <Download size={14} />
                    {ids.length > 0 ? `Скачать отмеченные (${ids.length})` : 'Скачать всё найденное'}
                  </ExportLink>
                </>
              )}
            </div>
          </div>

          {selected.size > 0 && (
            <div className="mt-3 rounded-xl bg-[var(--surface-sunken)] p-3">
              <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="primary"
                icon={<Send size={14} />}
                disabled={pending || selected.size > RESEND_MAX}
                title={
                  selected.size > RESEND_MAX
                    ? `За раз переотправляем не больше ${RESEND_MAX} писем`
                    : undefined
                }
                onClick={() =>
                  run(
                    resend,
                    { fileIds: ids },
                    (r) => `Поставлено писем в очередь: ${r.queued ?? 0}`,
                  )
                }
              >
                Переотправить
              </Button>
              <Button
                size="sm"
                icon={<RefreshCw size={14} />}
                disabled={pending}
                onClick={() =>
                  run(
                    reissue,
                    { fileIds: ids },
                    (r) =>
                      `Перевыпуск начат: ${r.reissued ?? 0}. Старые документы станут заменёнными, ` +
                      `как только новые будут готовы.`,
                  )
                }
              >
                Перевыпустить
              </Button>
              <Button
                size="sm"
                variant="danger"
                icon={<ShieldAlert size={14} />}
                disabled={pending}
                onClick={() => setRevoking({ fileIds: ids })}
              >
                Отозвать
              </Button>
              <Button
                size="sm"
                icon={<ShieldCheck size={14} />}
                disabled={pending}
                onClick={() =>
                  run(
                    revoke,
                    { fileIds: ids, revoked: false, expectedCount: ids.length },
                    (r) => `Проверка возвращена: ${r.changed ?? 0}`,
                  )
                }
              >
                Вернуть проверку
              </Button>
              </div>
              <p className="mt-2 text-xs text-[var(--text-muted)]">
                Перевыпуск создаёт новый документ вместо этого. Отзыв — признаёт документ
                недействительным без замены.
              </p>
            </div>
          )}

          <div className="mt-4">
            {registry.isPending ? (
              <Loading label="Открываем реестр" />
            ) : rows.length === 0 ? (
              <EmptyState hasFilters={query.length > 0} />
            ) : (
              <RegistryTable
                rows={rows}
                selected={selected}
                onToggle={toggle}
                onToggleAll={toggleAll}
                onOpen={setOpenFileId}
              />
            )}
          </div>

          {total > PAGE_SIZE && (
            <div className="mt-4 flex items-center gap-3">
              <Button
                size="sm"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              >
                Назад
              </Button>
              <span className="text-sm text-[var(--text-muted)] tabular-nums">
                {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} из{' '}
                {total.toLocaleString('ru-RU')}
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
        </>
      )}
      {openFileId && <DocumentHistory fileId={openFileId} onClose={() => setOpenFileId(null)} />}
      {revoking && (
        <RevokeDialog
          target={revoking}
          filters={filters}
          onClose={() => setRevoking(null)}
          onDone={async (changed) => {
            setRevoking(null);
            setSelected(new Set());
            setNotice({ text: `Отозвано документов: ${changed}`, skipped: [] });
            await Promise.all([
              qc.invalidateQueries({ queryKey: ['registry'] }),
              qc.invalidateQueries({ queryKey: ['registry-analytics'] }),
              qc.invalidateQueries({ queryKey: ['registry-detail'] }),
            ]);
          }}
        />
      )}
    </PageLayout>
  );
}

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return hasFilters ? (
    <Empty icon={Search} title="По этому отбору ничего нет">
      Попробуйте убрать часть условий.
    </Empty>
  ) : (
    <Empty icon={ShieldCheck} title="Здесь появятся выданные документы">
      Реестр наполняется сам: как только выпуск по материалу закончится, все грамоты и
      сертификаты будут искаться отсюда — по фамилии, почте или проверочному коду.
    </Empty>
  );
}

/** Выгрузка файла — ссылка в виде малой кнопки. */
function ExportLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 rounded-lg bg-[var(--surface)] px-2.5 py-1.5 text-sm font-medium ring-1 ring-[var(--line)] transition-colors hover:bg-[var(--surface-sunken)]"
    >
      {children}
    </a>
  );
}
