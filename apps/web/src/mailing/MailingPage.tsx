import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CalendarRange, ChevronRight, RefreshCw, Search, Send } from 'lucide-react';
import { api } from '../api/client';
import type { DocumentList, DocumentSummary } from '../api/types';
import { Button } from '../ui/Button';
import { Checkbox, Radio } from '../ui/Checkbox';
import { Input, Select } from '../ui/Field';
import { Loading } from '../ui/Loading';
import { LetterCard } from './LetterCard';
import { MailingLogTable } from './MailingLogTable';
import { MailLayout } from './MailNav';
import { Dialog } from './Dialog';
import { documentLine } from './document-line';
import { workspacePath } from './workspace-tabs';
import { undeliveredCount } from './letter-preview';
import {
  listCount,
  mailList,
  mailListLabel,
  mailListPath,
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

/**
 * Раздел «Письма»: письма, списки получателей и новая рассылка в одном месте.
 *
 * Отдельно от редактора материала: файлы почти всегда делают заранее,
 * а рассылают в день награждения, и человеку, пришедшему разослать,
 * незачем идти через макет.
 *
 * Списки и письма разводить по разным разделам нельзя: это одна работа
 * одного дня — собрать людей, выпустить им документы, отправить письма.
 * Разведи их, и список пришлось бы собирать здесь, а отправлять его
 * где-то ещё.
 *
 * Открывается раздел на всех письмах, а не на списках: чаще всего сюда
 * возвращаются посмотреть, дошло ли отправленное. Собрать новую рассылку —
 * синяя кнопка, она стоит на виду в двух местах рамки.
 *
 * Какая папка открыта — решает адрес `?list=`, а не состояние страницы:
 * на «Не доставлено» можно дать ссылку коллеге, а «Назад» в браузере
 * возвращает в предыдущую папку.
 */
export function MailingPage() {
  const [params] = useSearchParams();
  const list = mailList(params.get('list'));

  const [kind, setKind] = useState<LetterKind>('transactional');
  const [selected, setSelected] = useState<string[]>([]);
  const [source, setSource] = useState<RecipientSource>('table');
  const [emails, setEmails] = useState('');
  const [audiences, setAudiences] = useState<Record<string, Audience>>({});
  const [checking, setChecking] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [sent, setSent] = useState<SendResult | null>(null);

  /** Отбор писем: поиск, материал и отрезок времени. */
  const [search, setSearch] = useState('');
  const [documentId, setDocumentId] = useState('');
  const [period, setPeriod] = useState<MailPeriod>('all');
  const [refreshing, setRefreshing] = useState(false);

  const documents = useQuery({
    queryKey: ['documents', '', false],
    queryFn: () => api.get<DocumentList>('/documents?limit=50&trashed=false'),
  });

  /*
   * Журнал запрашиваем в любой папке, а не только в письмах: числа рядом
   * с папками считает он же, и без запроса колонка слева стояла бы пустой,
   * пока человек собирает рассылку.
   */
  const log = useMailingLog({
    documentId: documentId || undefined,
    problemsOnly: list === 'undelivered',
  });

  const audience = useAudience();
  const send = useSendMailing();

  const items = documents.data?.items ?? [];
  const chosen = items.filter((doc) => selected.includes(doc.id));

  const summary = log.data?.summary ?? {};
  const loaded = log.data?.items ?? [];
  const letters = loaded.filter(
    (item) =>
      matchesList(item, list) &&
      matchesSearch(item, search) &&
      withinPeriod(item.sentAt ?? item.queuedAt, period),
  );

  function toggle(id: string) {
    setSelected((ids) => (ids.includes(id) ? ids.filter((v) => v !== id) : [...ids, id]));
    // Прежний расчёт относился к другому набору материалов.
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
      {
        documentIds: selected,
        kind,
        source,
        emails: source === 'manual' ? emails : undefined,
      },
      {
        onSuccess: (result) => {
          setConfirm(false);
          setSent(result);
          setAudiences({});
        },
      },
    );
  }

  /** Обновить сейчас, не дожидаясь очередного опроса раз в пять секунд. */
  async function refresh() {
    setRefreshing(true);
    try {
      await log.refetch();
    } finally {
      setRefreshing(false);
    }
  }

  const letterFolder = list !== 'lists' && list !== 'new';

  return (
    <>
      <MailLayout
        counts={summary}
        head={
          <div className="flex min-w-0 items-baseline gap-2">
            {/* Открытая папка стоит в заголовке: иначе на половине списка
                непонятно, почему писем пять, когда их пятьсот. */}
            <h1 className="truncate text-lg font-medium">{mailListLabel(list)}</h1>
            {letterFolder && (
              <span className="tabular text-sm text-[var(--text-muted)]">
                {listCount(list, summary)}
              </span>
            )}
            {list === 'lists' && documents.data && (
              <span className="tabular text-sm text-[var(--text-muted)]">
                {documents.data.total}
              </span>
            )}
            {list === 'new' && (
              <Link
                to={mailListPath('all')}
                className="text-sm text-[var(--text-muted)] underline underline-offset-4 hover:text-[var(--text)]"
              >
                Вернуться к письмам
              </Link>
            )}
          </div>
        }
        tools={
          letterFolder ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void refresh()}
                title="Обновить"
                aria-label="Обновить список писем"
                className="grid h-9 w-9 place-items-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text)]"
              >
                <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
              </button>
              <div className="relative">
                <Search
                  size={16}
                  className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[var(--text-muted)]"
                />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Поиск в письмах"
                  aria-label="Поиск в письмах"
                  className="w-40 py-1.5 pl-9 text-sm sm:w-56"
                />
              </div>
            </div>
          ) : undefined
        }
        bar={
          letterFolder ? (
            <>
              <span className="tabular text-[var(--text-muted)]">Писем: {letters.length}</span>
              <div className="ml-auto flex flex-wrap items-center gap-3">
                <Select
                  value={documentId}
                  onChange={(e) => setDocumentId(e.target.value)}
                  aria-label="Материал"
                  className="w-52 py-1 text-sm"
                >
                  <option value="">Все материалы</option>
                  {items.map((doc) => (
                    <option key={doc.id} value={doc.id}>
                      {doc.title}
                    </option>
                  ))}
                </Select>
                <label className="flex items-center gap-2 text-[var(--text-muted)]">
                  <CalendarRange size={15} />
                  <Select
                    value={period}
                    onChange={(e) => setPeriod(e.target.value as MailPeriod)}
                    aria-label="Отрезок времени"
                    className="w-32 py-1 text-sm"
                  >
                    {MAIL_PERIODS.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </label>
              </div>
            </>
          ) : list === 'lists' ? (
            <span className="tabular text-[var(--text-muted)]">
              Материалов: {documents.data?.total ?? 0}
            </span>
          ) : undefined
        }
      >
        {letterFolder ? (
          log.isPending ? (
            <p className="text-[var(--text-muted)]">Загрузка…</p>
          ) : (
            <MailingLogTable
              items={letters}
              list={list}
              documentId={documentId}
              undelivered={undeliveredCount(summary)}
              searching={Boolean(search.trim()) || period !== 'all'}
              truncated={loaded.length >= 200}
            />
          )
        ) : documents.isPending ? (
          <Loading />
        ) : list === 'lists' ? (
          <Lists documents={items} />
        ) : (
          <div className="max-w-3xl space-y-8">
            <KindPicker
              kind={kind}
              onChange={(next) => {
                setKind(next);
                setAudiences({});
                setSent(null);
              }}
            />

            <Step title="Что рассылаем" hint="Можно выбрать несколько материалов сразу">
              {items.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)]">
                  Материалов пока нет.{' '}
                  <Link to="/documents" className="text-[var(--accent)] hover:underline">
                    Создайте первый
                  </Link>
                  .
                </p>
              ) : (
                <ul className="space-y-1">
                  {items.map((doc) => (
                    <li key={doc.id}>
                      {/* Не одно название: одноимённых материалов в библиотеке
                          бывает три подряд, а разослать не тому списку нельзя —
                          письмо не отзывается. */}
                      <label className="flex items-start gap-3 rounded-xl px-3 py-2 hover:bg-[var(--surface-sunken)]">
                        <Checkbox
                          checked={selected.includes(doc.id)}
                          onChange={() => toggle(doc.id)}
                          className="mt-1"
                        />
                        <span>
                          <span className="block">{doc.title}</span>
                          <span className="mt-0.5 block text-sm text-[var(--text-muted)]">
                            {documentLine(doc)}
                          </span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </Step>

            <Step
              title="Кому"
              hint="Основной способ — таблица получателей: по ней же выпускаются документы"
            >
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
              <Step title="Письмо" hint="У каждого материала своё письмо и своя проверка">
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
                icon={<Send size={16} />}
                disabled={chosen.length === 0 || send.isPending}
                onClick={() => setConfirm(true)}
              >
                Отправить
              </Button>
              {chosen.length === 0 && (
                <span className="text-sm text-[var(--text-muted)]">Сначала выберите материал</span>
              )}
              {send.isError && (
                <span className="text-sm text-[var(--danger)]">
                  {(send.error as Error).message}
                </span>
              )}
            </div>

            {sent && <SendReport result={sent} />}
          </div>
        )}
      </MailLayout>

      {confirm && (
        <Dialog
          title="Отправить рассылку"
          onClose={() => setConfirm(false)}
          footer={
            <>
              <Button variant="primary" onClick={onSend} disabled={send.isPending}>
                {send.isPending ? 'Отправляем…' : 'Отправить'}
              </Button>
              <Button onClick={() => setConfirm(false)}>Отмена</Button>
            </>
          }
        >
          <p className="text-sm">
            Поток: {kind === 'marketing' ? 'реклама' : 'выдача документа'}. Материалов:{' '}
            {chosen.length}.
          </p>
          {/* Поимённо, а не числом: последняя возможность заметить, что
              отмечен не тот из одноимённых материалов. */}
          <ul className="mt-2 space-y-1 text-sm">
            {chosen.map((doc) => (
              <li key={doc.id}>
                {doc.title}
                <span className="block text-xs text-[var(--text-muted)]">{documentLine(doc)}</span>
              </li>
            ))}
          </ul>
          {/* Отправленное письмо не отзывается — предупреждаем до нажатия,
              а не после. */}
          <p className="mt-3 text-sm text-[var(--text-muted)]">
            Письма уходят сразу и отозвать их нельзя. Тем, кому по этому материалу уже писали,
            повторное письмо не уйдёт.
          </p>
          {kind === 'marketing' && (
            <p className="mt-3 rounded-xl bg-[var(--surface-sunken)] px-4 py-3 text-sm">
              Рекламное письмо уйдёт только тем, кто дал согласие на рекламу. В письме будут пометка
              «Реклама», рекламодатель и ссылка отписки.
            </p>
          )}
        </Dialog>
      )}
    </>
  );
}

/**
 * Списки получателей — вход в работу со списком материала.
 *
 * Отсюда открывается рабочее место: таблица участников, проверка, выпуск
 * файлов и выгрузка. Раньше попасть туда можно было только с главной или
 * по прямой ссылке — в самом разделе списка материалов не было, и работа
 * со списком выглядела чем-то, что живёт где-то в другом месте.
 */
function Lists({ documents }: { documents: DocumentSummary[] }) {
  if (documents.length === 0) {
    return (
      <p className="text-sm text-[var(--text-muted)]">
        Материалов пока нет.{' '}
        <Link to="/documents" className="text-[var(--accent)] hover:underline">
          Создайте первый
        </Link>
        .
      </p>
    );
  }

  return (
    <ul className="divide-y divide-[var(--line)] overflow-hidden rounded-2xl bg-[var(--surface)] ring-1 ring-[var(--line)]">
      {documents.map((doc) => (
        <li key={doc.id}>
          <Link
            to={workspacePath(doc.id)}
            className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-[var(--surface-sunken)]"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate">{doc.title}</span>
              <span className="mt-0.5 block text-sm text-[var(--text-muted)]">
                {documentLine(doc)}
              </span>
            </span>
            <ChevronRight size={16} className="shrink-0 text-[var(--text-muted)]" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

/**
 * Выбор потока.
 *
 * Первый шаг, а не настройка в глубине: от него зависит и текст письма,
 * и список получателей, и законность отправки. Объяснение рядом —
 * оператор не обязан помнить статьи, но обязан выбрать верно.
 */
function KindPicker({
  kind,
  onChange,
}: {
  kind: LetterKind;
  onChange: (kind: LetterKind) => void;
}) {
  const options: { id: LetterKind; title: string; hint: string }[] = [
    {
      id: 'transactional',
      title: 'Выдача документа',
      hint: 'Грамота, ссылка на неё, уведомление о сроке. Согласие не требуется.',
    },
    {
      id: 'marketing',
      title: 'Реклама',
      hint: 'Приглашения и предложения. Только тем, кто дал согласие, — с отпиской.',
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {options.map((option) => (
        <label
          key={option.id}
          className={`cursor-pointer rounded-2xl p-4 ring-1 ${
            kind === option.id
              ? 'bg-[var(--accent-soft)] ring-[var(--accent)]'
              : 'bg-[var(--surface)] ring-[var(--line)]'
          }`}
        >
          <span className="flex items-center gap-2 font-medium">
            <Radio
              name="letter-kind"
              checked={kind === option.id}
              onChange={() => onChange(option.id)}
            />
            {option.title}
          </span>
          <span className="mt-1.5 block text-sm text-[var(--text-muted)]">{option.hint}</span>
        </label>
      ))}
    </div>
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
      <label className="flex items-start gap-3">
        <Radio
          name="recipient-source"
          checked={source === 'table'}
          onChange={() => onSource('table')}
          className="mt-1"
        />
        <span>
          <span className="font-medium">Из таблицы получателей</span>
          <span className="mt-0.5 block text-sm text-[var(--text-muted)]">
            Отмеченные строки материала — те же, по которым выпускались документы.
          </span>
        </span>
      </label>

      <label className="flex items-start gap-3">
        <Radio
          name="recipient-source"
          checked={source === 'manual'}
          onChange={() => onSource('manual')}
          className="mt-1"
        />
        <span>
          <span className="font-medium">Списком адресов</span>
          <span className="mt-0.5 block text-sm text-[var(--text-muted)]">
            Для тех, кого нужно догнать отдельно. Адрес, который есть в таблице, получит свой
            документ и своё имя в письме.
          </span>
        </span>
      </label>

      {source === 'manual' && (
        <textarea
          value={emails}
          onChange={(e) => onEmails(e.target.value)}
          rows={5}
          spellCheck={false}
          placeholder={'ivanov@example.ru\npetrov@example.ru'}
          aria-label="Список адресов"
          className="w-full rounded-xl bg-[var(--surface)] px-3 py-2 font-mono text-sm ring-1 ring-[var(--line)] focus:ring-2 focus:ring-[var(--accent)] focus:outline-none"
        />
      )}
    </div>
  );
}

/** Что ушло, а что нет — сразу после отправки, поимённо. */
function SendReport({ result }: { result: SendResult }) {
  return (
    <div className="space-y-3 rounded-2xl bg-[var(--surface)] p-5 ring-1 ring-[var(--line)]">
      <h3 className="font-medium">Отправлено писем: {result.queued}</h3>
      {result.results.map((item) => (
        <div key={item.documentId} className="text-sm">
          <p>
            {item.title} — <b>{item.queued}</b>
          </p>
          {item.skipped.length > 0 && (
            <details className="mt-1">
              <summary className="cursor-pointer text-[var(--text-muted)]">
                Не ушло: {item.skipped.length} — посмотреть причины
              </summary>
              <ul className="mt-1 space-y-1">
                {item.skipped.slice(0, 100).map((skipped, i) => (
                  <li key={`${skipped.email}-${i}`}>
                    {skipped.name || skipped.email || 'Без имени'} — {skipped.reason}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      ))}
      {/* Дорога к результату: письма уходят очередью, и состояние появится
          не здесь, а в папках слева. */}
      <p className="text-sm text-[var(--text-muted)]">
        Письма уходят очередью — состояние доставки появится{' '}
        <Link to={mailListPath('all')} className="underline underline-offset-4">
          в списке писем
        </Link>
        .
      </p>
    </div>
  );
}

function Step({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="font-serif text-lg">{title}</h2>
      {hint && <p className="mt-1 mb-3 text-sm text-[var(--text-muted)]">{hint}</p>}
      <div className={hint ? '' : 'mt-3'}>{children}</div>
    </section>
  );
}
