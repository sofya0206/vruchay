import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Plus, RefreshCw, Search, Send } from 'lucide-react';
import { api, errorText } from '../api/client';
import type { DocumentList } from '../api/types';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Checkbox, Radio } from '../ui/Checkbox';
import { Dialog } from '../ui/Dialog';
import { ErrorBar } from '../ui/ErrorState';
import { Input, Textarea } from '../ui/Field';
import { IconButton } from '../ui/IconButton';
import { Loading } from '../ui/Loading';
import { NextAction } from '../ui/NextAction';
import { Outcome } from '../ui/Outcome';
import { PageHeader } from '../ui/PageHeader';
import { PageLayout } from '../ui/SectionLayout';
import { Select } from '../ui/Select';
import { SkeletonRows } from '../ui/Skeleton';
import { Segmented, UnderlineTabs } from '../ui/Tabs';
import { legacyTarget } from '../shell/redirects';
import { MailStats } from './MailStats';
import { TextMailingForm } from './TextMailing';
import { KindPicker } from './KindPicker';
import { rangePeriod, statsRange, STATS_RANGES } from './mail-stats';
import { LetterCard } from './LetterCard';
import { MailingLogTable } from './MailingLogTable';
import { documentLine } from './document-line';
import { undeliveredCount } from './letter-preview';
import {
  LETTER_LISTS,
  listCount,
  mailStatus,
  MAIL_PERIODS,
  matchesList,
  matchesSearch,
  withinPeriod,
  type MailPeriod,
} from './mail-lists';
import {
  useAudience,
  useMailingLog,
  useSendMailing,
  type Audience,
  type LetterKind,
  type RecipientSource,
  type SendResult,
} from './api';

export type MailView = 'log' | 'stats' | 'new';

/**
 * Раздел «Письма»: журнал, сводка и новая рассылка — три экрана под
 * одной шапкой.
 *
 * Колонки папок больше нет: состояния писем — чипы над журналом,
 * сводка — соседняя вкладка, новая рассылка — единственная залитая
 * кнопка. Списки получателей живут у документа на шаге «Получатели»,
 * и сюда за ними не ходят.
 *
 * Открывается на журнале, а не на мастере: чаще всего сюда возвращаются
 * посмотреть, дошло ли отправленное. Что отобрано — решает адрес
 * (`?status=`, `?documentId=`), поэтому на «Не доставлено» можно дать
 * ссылку коллеге, а «Назад» в браузере возвращает в предыдущий отбор.
 */
export function MailingPage({ view }: { view: MailView }) {
  const { pathname, search } = useLocation();
  const legacy = legacyTarget(pathname, search);
  if (legacy) return <Navigate to={legacy} replace />;

  return view === 'new' ? <NewMailing /> : <MailJournal view={view} />;
}

function MailJournal({ view }: { view: 'log' | 'stats' }) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const status = mailStatus(params.get('status'));
  const range = statsRange(params.get('range'));
  const documentId = params.get('documentId') ?? '';

  /** Сменить параметр адреса, не трогая остальные. */
  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(params);
    if (value === null || value === '') next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  }

  const [searchText, setSearchText] = useState('');
  const [period, setPeriod] = useState<MailPeriod>('all');
  const [refreshing, setRefreshing] = useState(false);

  const documents = useQuery({
    queryKey: ['documents', '', false],
    queryFn: () => api.get<DocumentList>('/documents?limit=50&trashed=false'),
  });

  /*
   * Ищет сервер — по всем письмам, а не по двумстам загруженным. Запрос
   * уходит, когда человек перестал печатать; до ответа загруженные письма
   * фильтруются тут же, чтобы список отзывался на каждую букву.
   */
  const [serverSearch, setServerSearch] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setServerSearch(searchText.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchText]);

  const log = useMailingLog({
    documentId: documentId || undefined,
    problemsOnly: status === 'undelivered',
    search: serverSearch || undefined,
  });

  const summary = log.data?.summary ?? {};
  const loaded = log.data?.items ?? [];
  const letters = loaded.filter(
    (item) =>
      matchesList(item, status) &&
      matchesSearch(item, searchText) &&
      withinPeriod(item.sentAt ?? item.queuedAt, period),
  );
  const items = documents.data?.items ?? [];

  /** Обновить сейчас, не дожидаясь очередного опроса раз в пять секунд. */
  async function refresh() {
    setRefreshing(true);
    try {
      await log.refetch();
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <PageLayout
      head={
        <PageHeader
          title="Письма"
          count={view === 'log' ? listCount(status, summary) : null}
          actions={
            <Button variant="primary" to="/mailing/new" icon={<Plus size={16} />}>
              <span className="max-md:hidden">Новая рассылка</span>
              <span className="md:hidden">Рассылка</span>
            </Button>
          }
        />
      }
    >
      <div className="space-y-4">
        <UnderlineTabs
          label="Разделы писем"
          value={view}
          onChange={(next) => navigate(next === 'stats' ? '/mailing/stats' : '/mailing')}
          items={[
            { id: 'log', label: 'Журнал' },
            { id: 'stats', label: 'Сводка' },
          ]}
        />

        {view === 'stats' ? (
          <>
            <Segmented
              label="Отрезок"
              value={range}
              onChange={(next) => setParam('range', next === '30' ? null : next)}
              items={STATS_RANGES.map((r) => ({ id: r.id, label: r.label }))}
            />
            <MailStats period={rangePeriod(range)} />
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <div data-tour="mail-status" className="max-w-full">
                <Segmented
                  label="Состояние писем"
                  value={status}
                  onChange={(next) => setParam('status', next === 'all' ? null : next)}
                  items={LETTER_LISTS.map((item) => ({
                    id: item.id,
                    label: item.label,
                    count: listCount(item.id, summary) || null,
                  }))}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2 md:ml-auto">
                <div className="relative max-md:flex-1">
                  <Search size={16} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted" aria-hidden />
                  <Input
                    compact
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    placeholder="Поиск в письмах"
                    aria-label="Поиск в письмах"
                    data-tour="mail-search"
                    className="w-56 pl-8 max-md:w-full"
                  />
                </div>
                <Select
                  compact
                  value={documentId}
                  onChange={(next) => setParam('documentId', next)}
                  options={[{ value: '', label: 'Все документы' }, ...items.map((doc) => ({ value: doc.id, label: doc.title }))]}
                  aria-label="Документ"
                  className="w-48 max-md:flex-1"
                />
                <Select
                  compact
                  value={period}
                  onChange={setPeriod}
                  options={MAIL_PERIODS.map((o) => ({ value: o.id, label: o.label }))}
                  aria-label="Отрезок времени"
                  className="w-32"
                />
                <IconButton label="Обновить список писем" size="sm" onClick={() => void refresh()}>
                  <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
                </IconButton>
              </div>
            </div>

            {log.isPending ? (
              <Card padding="none">
                <SkeletonRows rows={6} label="Загружаем письма" />
              </Card>
            ) : log.isError ? (
              <ErrorBar onRetry={() => void log.refetch()}>Журнал писем не загрузился</ErrorBar>
            ) : (
              <MailingLogTable
                items={letters}
                status={status}
                documentId={documentId}
                undelivered={undeliveredCount(summary)}
                searching={Boolean(searchText.trim()) || period !== 'all'}
                truncated={loaded.length >= 200}
              />
            )}
          </>
        )}
      </div>
    </PageLayout>
  );
}

/**
 * Новая рассылка: письма по документам или только текст.
 *
 * Рассылка без документа — тот же поток и тот же выбор потока, но без
 * материалов: приглашения, переносы, напоминания.
 */
function NewMailing() {
  const [params, setParams] = useSearchParams();
  const mode = params.get('mode') === 'text' ? 'text' : 'documents';

  function setMode(next: 'documents' | 'text') {
    const p = new URLSearchParams(params);
    if (next === 'text') p.set('mode', 'text');
    else p.delete('mode');
    setParams(p, { replace: true });
  }

  return (
    <PageLayout head={<PageHeader title="Новая рассылка" back={{ to: '/mailing', label: 'Письма' }} />}>
      <div className="mx-auto w-full max-w-3xl space-y-8">
        <Segmented
          label="Что рассылаем"
          value={mode}
          onChange={setMode}
          items={[
            { id: 'documents', label: 'Документы' },
            { id: 'text', label: 'Только текст' },
          ]}
        />
        {mode === 'text' ? <TextMailingForm /> : <DocumentsMailing />}
      </div>
    </PageLayout>
  );
}

function DocumentsMailing() {
  const [kind, setKind] = useState<LetterKind>('transactional');
  const [selected, setSelected] = useState<string[]>([]);
  const [source, setSource] = useState<RecipientSource>('table');
  const [emails, setEmails] = useState('');
  const [audiences, setAudiences] = useState<Record<string, Audience>>({});
  const [checking, setChecking] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [sent, setSent] = useState<SendResult | null>(null);

  const documents = useQuery({
    queryKey: ['documents', '', false],
    queryFn: () => api.get<DocumentList>('/documents?limit=50&trashed=false'),
  });
  const audience = useAudience();
  const send = useSendMailing();

  const items = documents.data?.items ?? [];
  const chosen = items.filter((doc) => selected.includes(doc.id));

  function toggle(id: string) {
    setSelected((ids) => (ids.includes(id) ? ids.filter((v) => v !== id) : [...ids, id]));
    // Прежний расчёт относился к другому набору документов.
    setSent(null);
  }

  async function check(target: string) {
    setChecking(target);
    try {
      const result = await audience.mutateAsync({
        documentId: target,
        kind,
        source,
        emails: source === 'manual' ? emails : undefined,
      });
      setAudiences((prev) => ({ ...prev, [target]: result }));
    } finally {
      setChecking(null);
    }
  }

  function onSend() {
    send.mutate(
      { documentIds: selected, kind, source, emails: source === 'manual' ? emails : undefined },
      {
        onSuccess: (result) => {
          setConfirm(false);
          setSent(result);
          setAudiences({});
        },
      },
    );
  }

  if (documents.isPending) return <Loading />;

  if (items.length === 0) {
    return (
      <Card padding="none">
        <NextAction
          icon={Send}
          title="Сначала создайте документ"
          text="Письма участникам уходят по документу и его списку получателей."
          primary={{ label: 'К документам', to: '/documents?new=1' }}
        />
      </Card>
    );
  }

  return (
    <>
      <KindPicker
        kind={kind}
        onChange={(next) => {
          setKind(next);
          setAudiences({});
          setSent(null);
        }}
      />

      <Step n={1} title="Что рассылаем" hint="Можно выбрать несколько документов сразу">
        <ul className="space-y-1">
          {items.map((doc) => (
            <li key={doc.id}>
              {/* Не одно название: одноимённых документов в библиотеке бывает три
                  подряд, а разослать не тому списку нельзя — письмо не отзывается. */}
              <label className="flex items-start gap-3 rounded-card px-3 py-2 hover:bg-row-hover">
                <Checkbox checked={selected.includes(doc.id)} onChange={() => toggle(doc.id)} className="mt-0.5" />
                <span>
                  <span className="block text-sm font-medium">{doc.title}</span>
                  <span className="mt-0.5 block text-sm text-muted">{documentLine(doc)}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </Step>

      <Step n={2} title="Кому" hint="Основной способ — таблица получателей: по ней же выпускаются документы">
        <RecipientsPicker
          source={source}
          emails={emails}
          onSource={(next) => {
            setSource(next);
            setAudiences({});
          }}
          onEmails={(next) => {
            setEmails(next);
            setAudiences({});
          }}
        />
      </Step>

      {chosen.length > 0 && (
        <Step n={3} title="Письмо" hint="У каждого документа своё письмо и своя проверка">
          <div className="space-y-4">
            {chosen.map((doc) => (
              <LetterCard
                key={`${doc.id}-${kind}`}
                documentId={doc.id}
                title={doc.title}
                subtitle={documentLine(doc)}
                kind={kind}
                audience={audiences[doc.id]}
                checking={checking === doc.id}
                onCheck={() => void check(doc.id)}
              />
            ))}
          </div>
        </Step>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <Button
          variant="primary"
          size="lg"
          icon={<Send size={16} />}
          disabled={chosen.length === 0}
          loading={send.isPending}
          onClick={() => setConfirm(true)}
        >
          Отправить
        </Button>
        {chosen.length === 0 && <span className="text-sm text-muted">Сначала выберите документ</span>}
      </div>
      {send.isError && <ErrorBar>{errorText(send.error)}</ErrorBar>}

      {sent && <SendReport result={sent} />}

      {confirm && (
        <Dialog
          title="Отправить рассылку"
          size="sm"
          onClose={() => setConfirm(false)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setConfirm(false)}>
                Отмена
              </Button>
              <Button variant="primary" onClick={onSend} loading={send.isPending}>
                Отправить
              </Button>
            </>
          }
        >
          <p className="text-sm">
            Поток: {kind === 'marketing' ? 'реклама' : 'выдача документа'}. Документов: {chosen.length}.
          </p>
          {/* Поимённо, а не числом: последняя возможность заметить, что
              отмечен не тот из одноимённых документов. */}
          <ul className="mt-2 space-y-1 text-sm">
            {chosen.map((doc) => (
              <li key={doc.id}>
                {doc.title}
                <span className="block text-xs text-muted">{documentLine(doc)}</span>
              </li>
            ))}
          </ul>
          {/* Отправленное письмо не отзывается — предупреждаем до нажатия, а не после. */}
          <p className="mt-3 text-sm text-muted">
            Письма уходят сразу и отозвать их нельзя. Тем, кому по этому документу уже писали, повторное письмо
            не уйдёт.
          </p>
          {kind === 'marketing' && (
            <p className="mt-3 rounded-card bg-sunken px-4 py-3 text-sm">
              Рекламное письмо уйдёт только тем, кто дал согласие на рекламу. В письме будут пометка «Реклама»,
              рекламодатель и ссылка отписки.
            </p>
          )}
        </Dialog>
      )}
    </>
  );
}

function RecipientsPicker({
  source,
  emails,
  onSource,
  onEmails,
}: {
  source: RecipientSource;
  emails: string;
  onSource: (source: RecipientSource) => void;
  onEmails: (emails: string) => void;
}) {
  return (
    <div className="space-y-3">
      <Radio
        name="recipient-source"
        checked={source === 'table'}
        onChange={() => onSource('table')}
        label={<span className="font-medium">Из таблицы получателей</span>}
        hint="Отмеченные строки документа — те же, по которым выпускались документы."
      />
      <Radio
        name="recipient-source"
        checked={source === 'manual'}
        onChange={() => onSource('manual')}
        label={<span className="font-medium">Списком адресов</span>}
        hint="Для тех, кого нужно догнать отдельно. Адрес, который есть в таблице, получит свой документ и своё имя в письме."
      />
      {source === 'manual' && (
        <Textarea
          value={emails}
          onChange={(e) => onEmails(e.target.value)}
          rows={5}
          spellCheck={false}
          placeholder={'ivanov@example.ru\npetrov@example.ru'}
          aria-label="Список адресов"
          className="font-mono text-sm"
        />
      )}
    </div>
  );
}

/** Что ушло, а что нет — сразу после отправки, поимённо. */
function SendReport({ result }: { result: SendResult }) {
  const skipped = result.results.reduce((sum, item) => sum + item.skipped.length, 0);
  return (
    <Card title="Отправлено">
      <Outcome done={result.queued} skipped={skipped} doneLabel="писем в очереди" skippedLabel="не ушло" />
      <div className="mt-4 space-y-3 text-sm">
        {result.results.map((item) => (
          <div key={item.documentId}>
            <p>
              {item.title} — <b className="tabular">{item.queued}</b>
            </p>
            {item.skipped.length > 0 && (
              <details className="mt-1">
                <summary className="cursor-pointer text-muted">Не ушло: {item.skipped.length} — посмотреть причины</summary>
                <ul className="mt-1 space-y-1">
                  {item.skipped.slice(0, 100).map((s, i) => (
                    <li key={`${s.email}-${i}`}>
                      {s.name || s.email || 'Без имени'} — {s.reason}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        ))}
      </div>
      {/* Дорога к результату: письма уходят очередью, и состояние появится в журнале. */}
      <p className="mt-4 text-sm text-muted">
        Письма уходят очередью — состояние доставки появится{' '}
        <Link to="/mailing" className="text-accent hover:underline">
          в журнале
        </Link>
        .
      </p>
    </Card>
  );
}

/** Шаг рассылки: номер в кружке, название, подсказка. */
function Step({ n, title, hint, children }: { n: number; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="flex items-center gap-3 text-lg font-medium">
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-accent-soft text-sm font-medium text-accent">
          {n}
        </span>
        {title}
      </h2>
      {hint && <p className="mt-1 mb-3 pl-10 text-sm text-muted">{hint}</p>}
      <div className={hint ? 'pl-10' : 'mt-3 pl-10'}>{children}</div>
    </section>
  );
}
