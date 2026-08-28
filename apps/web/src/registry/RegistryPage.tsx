import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  Download,
  FileSpreadsheet,
  RefreshCw,
  Send,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { Loading } from '../ui/Loading';
import {
  emptyFilters,
  filtersToQuery,
  useRegistry,
  useRegistryAction,
  useRegistryFacets,
  type RegistryFilters as Filters,
  type SkippedItem,
} from '../api/registry';
import { ApiError } from '../api/client';
import { RegistryFilters } from './RegistryFilters';
import { RegistryTable } from './RegistryTable';
import { DocumentHistory } from './DocumentHistory';
import { AnalyticsPanel } from './AnalyticsPanel';
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
  const [tab, setTab] = useState<'registry' | 'analytics'>('registry');
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openFileId, setOpenFileId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; skipped: SkippedItem[] } | null>(null);

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
    <div className="min-h-full">
      <header className="border-b border-[var(--line)] bg-[var(--surface)]">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-6 py-3">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm text-[var(--text-muted)] hover:text-[var(--text)]"
          >
            <ArrowLeft size={16} />К материалам
          </Link>
          <span className="ml-auto font-serif text-lg">Реестр выданного</span>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        <div role="tablist" className="mb-6 inline-flex rounded-xl bg-[var(--surface-sunken)] p-1">
          {(
            [
              ['registry', 'Реестр'],
              ['analytics', 'Аналитика'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              role="tab"
              aria-selected={tab === value}
              onClick={() => setTab(value)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors duration-200 ${
                tab === value
                  ? 'bg-[var(--surface)] text-[var(--text)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text)]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

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
                {notice.skipped.length > 10 && (
                  <li>и ещё {notice.skipped.length - 10}</li>
                )}
              </ul>
            )}
          </div>
        )}

        {tab === 'analytics' ? (
          <div className="mt-6">
            <AnalyticsPanel filters={filters} active={tab === 'analytics'} />
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
                <a
                  href={`/api/registry/export.csv${query ? `?${query}` : ''}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button size="sm" icon={<FileSpreadsheet size={14} />}>
                    Таблицей
                  </Button>
                </a>
                <a
                  href={`/api/registry/archive?${[query, ids.length > 0 ? `ids=${ids.join(',')}` : '']
                    .filter(Boolean)
                    .join('&')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button size="sm" icon={<Download size={14} />} disabled={total === 0}>
                    {ids.length > 0 ? `Скачать отмеченные (${ids.length})` : 'Скачать всё найденное'}
                  </Button>
                </a>
              </div>
            </div>

            {selected.size > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-[var(--surface-sunken)] p-3">
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
                    run(resend, { fileIds: ids }, (r) => `Поставлено писем в очередь: ${r.queued ?? 0}`)
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
                  onClick={() =>
                    run(revoke, { fileIds: ids, revoked: true }, (r) => `Отозвано документов: ${r.changed ?? 0}`)
                  }
                >
                  Отозвать
                </Button>
                <Button
                  size="sm"
                  icon={<ShieldCheck size={14} />}
                  disabled={pending}
                  onClick={() =>
                    run(revoke, { fileIds: ids, revoked: false }, (r) => `Проверка возвращена: ${r.changed ?? 0}`)
                  }
                >
                  Вернуть проверку
                </Button>
                <span className="text-xs text-[var(--text-muted)]">
                  Перевыпуск создаёт новый документ вместо этого. Отзыв — признаёт документ
                  недействительным без замены.
                </span>
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
      </main>

      {openFileId && (
        <DocumentHistory fileId={openFileId} onClose={() => setOpenFileId(null)} />
      )}
    </div>
  );
}

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="rounded-2xl bg-[var(--surface-sunken)] p-6 text-sm text-[var(--text-muted)]">
      {hasFilters ? (
        <p>По этому отбору ничего нет. Попробуйте убрать часть условий.</p>
      ) : (
        <>
          <p className="text-[var(--text)]">Здесь появятся выданные документы.</p>
          <p className="mt-1">
            Реестр наполняется сам: как только выпуск по материалу закончится, все грамоты
            и сертификаты будут искаться отсюда — по фамилии, почте или проверочному коду.
          </p>
        </>
      )}
    </div>
  );
}
