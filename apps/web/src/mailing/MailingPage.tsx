import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Award, ChevronLeft, Send } from 'lucide-react';
import { api } from '../api/client';
import type { DocumentList } from '../api/types';
import { Button } from '../ui/Button';
import { Loading } from '../ui/Loading';
import { LetterCard } from './LetterCard';
import { MailingLogTable } from './MailingLogTable';
import { Dialog } from './Dialog';
import {
  useAudience,
  useSendMailing,
  type Audience,
  type LetterKind,
  type RecipientSource,
  type SendResult,
} from './api';

/**
 * Раздел «Рассылка».
 *
 * Отдельно от редактора материала: файлы почти всегда делают заранее,
 * а рассылают в день награждения, и человеку, пришедшему разослать,
 * незачем идти через макет.
 *
 * Шапка своя. Общей оболочки в кабинете пока нет — её делает соседняя
 * задача, и до её приезда каждая страница рисует себя сама.
 */
export function MailingPage() {
  const [tab, setTab] = useState<'new' | 'log'>('new');
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
    // Прежний расчёт относился к другому набору материалов.
    setSent(null);
  }

  async function check(documentId: string) {
    setChecking(documentId);
    try {
      const result = await audience.mutateAsync({
        documentId,
        kind,
        source,
        emails: source === 'manual' ? emails : undefined,
      });
      setAudiences((prev) => ({ ...prev, [documentId]: result }));
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

  if (documents.isPending) return <Loading />;

  return (
    <div className="min-h-full">
      <header className="border-b border-[var(--line)] bg-[var(--surface)]">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-6 py-3">
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-[var(--text-muted)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text)]"
          >
            <ChevronLeft size={16} />
            <span className="hidden sm:inline">Материалы</span>
          </Link>
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--accent)] text-[var(--accent-contrast)]">
            <Award size={17} strokeWidth={1.75} />
          </span>
          <span className="font-serif text-lg">Рассылка</span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-6">
        <div className="mb-6 flex gap-1">
          <TabButton active={tab === 'new'} onClick={() => setTab('new')}>
            Новая рассылка
          </TabButton>
          <TabButton active={tab === 'log'} onClick={() => setTab('log')}>
            Журнал доставки
          </TabButton>
        </div>

        {tab === 'log' ? (
          <MailingLogTable documents={items} />
        ) : (
          <div className="space-y-8">
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
                  <Link to="/" className="text-[var(--accent)] hover:underline">
                    Создайте первый
                  </Link>
                  .
                </p>
              ) : (
                <ul className="space-y-1">
                  {items.map((doc) => (
                    <li key={doc.id}>
                      <label className="flex items-center gap-3 rounded-xl px-3 py-2 hover:bg-[var(--surface-sunken)]">
                        <input
                          type="checkbox"
                          checked={selected.includes(doc.id)}
                          onChange={() => toggle(doc.id)}
                        />
                        <span>{doc.title}</span>
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
                <span className="text-sm text-[var(--text-muted)]">
                  Сначала выберите материал
                </span>
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
      </main>

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
            Материалов: {chosen.length}. Поток:{' '}
            {kind === 'marketing' ? 'реклама' : 'выдача документа'}.
          </p>
          {/* Отправленное письмо не отзывается — предупреждаем до нажатия,
              а не после. */}
          <p className="mt-3 text-sm text-[var(--text-muted)]">
            Письма уходят сразу и отозвать их нельзя. Тем, кому по этому материалу уже
            писали, повторное письмо не уйдёт.
          </p>
          {kind === 'marketing' && (
            <p className="mt-3 rounded-xl bg-[var(--surface-sunken)] px-4 py-3 text-sm">
              Рекламное письмо уйдёт только тем, кто дал согласие на рекламу. В письме
              будут пометка «Реклама», рекламодатель и ссылка отписки.
            </p>
          )}
        </Dialog>
      )}
    </div>
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
            <input
              type="radio"
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
        <input
          type="radio"
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
        <input
          type="radio"
          name="recipient-source"
          checked={source === 'manual'}
          onChange={() => onSource('manual')}
          className="mt-1"
        />
        <span>
          <span className="font-medium">Списком адресов</span>
          <span className="mt-0.5 block text-sm text-[var(--text-muted)]">
            Для тех, кого нужно догнать отдельно. Адрес, который есть в таблице, получит
            свой документ и своё имя в письме.
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
      <p className="text-sm text-[var(--text-muted)]">
        Письма уходят очередью — состояние доставки появится в журнале.
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

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active}
      className={`rounded-lg px-3 py-1.5 text-sm ${
        active
          ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
          : 'text-[var(--text-muted)] hover:bg-[var(--surface-sunken)]'
      }`}
    >
      {children}
    </button>
  );
}
