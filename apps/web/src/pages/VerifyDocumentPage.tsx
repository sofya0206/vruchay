import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  BadgeCheck,
  CalendarX,
  Check,
  FileSearch,
  Flag,
  RefreshCw,
  Share2,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  X,
} from 'lucide-react';
import { Meta } from '../seo/Meta';
import { sameDigest, sha256Hex } from '../verify/sha256';

type State = 'valid' | 'revoked' | 'replaced' | 'expired';

interface VerifyResult {
  state: State;
  valid: boolean;
  replaced: boolean;
  expired: boolean;
  revoked: boolean;
  /** Код, напечатанный на бумаге, — по нему человек сверяет страницу с листом. */
  code: string;
  title: string;
  event: { name: string; date: string };
  issuedAt: string;
  expiresAt: string | null;
  fields: Record<string, string>;
  issuer: {
    name: string;
    verified: boolean;
    publicPath: string | null;
    contactEmail: string | null;
    website: string | null;
  };
  indexable: boolean;
  /** Отпечаток выпущенного файла; null у документов, выпущенных до его появления. */
  sha256: string | null;
  /** Подписан ли PDF электронной подписью сервиса. */
  signed: boolean;
  revokedAt: string | null;
  revokedReason: string | null;
  /** Куда смотреть вместо этого. Пусто, если замена сама недействительна. */
  replacedBy: { code: string; path: string; issuedAt: string } | null;
}

/** Почему «не найдено» — сервер выводит это из одного лишь введённого кода. */
type NotFoundReason = 'malformed' | 'checksum' | 'unknown';

type Outcome =
  | { kind: 'pending' }
  | { kind: 'found'; data: VerifyResult }
  | { kind: 'missing'; reason: NotFoundReason }
  | { kind: 'throttled' }
  | { kind: 'error' };

/**
 * Страница проверки подлинности документа.
 *
 * Открывается по QR-коду с грамоты. Смотрит её посторонний человек —
 * работодатель, приёмная комиссия, судья, — у которого нет и не будет
 * учётной записи, поэтому вход не требуется.
 *
 * Ответ намеренно скупой: подлинность, название и те поля, которые
 * организация сама разрешила показывать, в том виде, который разрешил
 * эмитент. Адрес почты и прочие колонки таблицы сюда не попадают —
 * иначе перебор ссылок стал бы способом выгрузить список участников.
 *
 * Запрос идёт мимо общего клиента намеренно: у «не найдено» есть причина
 * в теле ответа, а клиент оставляет от ошибки одно сообщение.
 */
export function VerifyDocumentPage() {
  const { publicId = '' } = useParams();
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'pending' });

  useEffect(() => {
    let alive = true;
    setOutcome({ kind: 'pending' });
    void (async () => {
      try {
        const res = await fetch(`/api/v1/verify/${encodeURIComponent(publicId)}`, {
          credentials: 'omit',
        });
        if (!alive) return;
        if (res.ok) {
          setOutcome({ kind: 'found', data: (await res.json()) as VerifyResult });
          return;
        }
        if (res.status === 404) {
          let reason: NotFoundReason = 'unknown';
          try {
            reason = ((await res.json()) as { reason?: NotFoundReason }).reason ?? 'unknown';
          } catch {
            // Тело могло быть пустым — тогда причина неизвестна.
          }
          setOutcome({ kind: 'missing', reason });
          return;
        }
        setOutcome({ kind: res.status === 429 ? 'throttled' : 'error' });
      } catch {
        if (alive) setOutcome({ kind: 'error' });
      }
    })();
    return () => {
      alive = false;
    };
  }, [publicId]);

  const data = outcome.kind === 'found' ? outcome.data : null;

  return (
    <>
      <Meta
        title={data ? `${data.title} — проверка подлинности` : 'Проверка подлинности документа — Вручай'}
        description="Проверка подлинности документа по коду с бланка."
        path={`/c/${publicId}`}
        // Пускать поисковики или нет — решает эмитент; по умолчанию нет.
        noindex={!data?.indexable}
      />
      <div className="grid min-h-full place-items-center bg-[var(--ground)] px-6 py-16">
        <main className="w-full max-w-md">
          {outcome.kind === 'pending' && (
            <p className="text-center text-[var(--text-muted)]">Проверяем…</p>
          )}
          {outcome.kind === 'throttled' && (
            <Card tone="muted">
              <h1 className="font-serif text-2xl">Слишком много проверок</h1>
              <p className="mt-2 text-[var(--text-muted)]">
                С вашего адреса пришло много запросов подряд. Подождите минуту и откройте
                страницу снова.
              </p>
            </Card>
          )}
          {outcome.kind === 'error' && (
            <Card tone="muted">
              <h1 className="font-serif text-2xl">Не удалось проверить</h1>
              <p className="mt-2 text-[var(--text-muted)]">
                Что-то пошло не так на нашей стороне. Попробуйте ещё раз через минуту.
              </p>
            </Card>
          )}
          {outcome.kind === 'missing' && <NotFound reason={outcome.reason} typed={publicId} />}
          {data && <Verdict data={data} />}

          <p className="mt-6 text-center text-sm text-[var(--text-muted)]">
            Проверка выполнена сервисом{' '}
            <Link to="/" className="text-[var(--accent)] hover:underline">
              Вручай
            </Link>
          </p>
        </main>
      </div>
    </>
  );
}

type Tone = 'ok' | 'warn' | 'bad' | 'muted';

/**
 * Карточка вердикта. Цвет — на всей рамке, а не только на значке:
 * человек с бумагой в руках должен понять ответ с расстояния вытянутой
 * руки, не вчитываясь.
 */
function Card({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  const ring: Record<Tone, string> = {
    ok: 'ring-2 ring-[var(--accent)]',
    warn: 'ring-2 ring-[var(--award)]',
    bad: 'ring-2 ring-[var(--danger)]',
    muted: 'ring-1 ring-[var(--line)]',
  };
  return (
    <div className={`rounded-2xl bg-[var(--surface)] p-8 text-center ${ring[tone]}`}>
      {children}
    </div>
  );
}

const VERDICT: Record<
  State,
  { tone: Tone; title: string; icon: React.ReactNode; text: string }
> = {
  valid: {
    tone: 'ok',
    title: 'Документ подлинный',
    icon: <BadgeCheck size={44} className="mx-auto text-[var(--accent)]" strokeWidth={1.5} />,
    text: '',
  },
  expired: {
    tone: 'warn',
    title: 'Срок действия истёк',
    icon: <CalendarX size={44} className="mx-auto text-[var(--award)]" strokeWidth={1.5} />,
    text:
      'Документ подлинный, но срок его действия закончился. Он подтверждает то, ' +
      'что было на момент выдачи, а не сегодняшний день.',
  },
  replaced: {
    tone: 'warn',
    title: 'Этот документ заменён',
    icon: <RefreshCw size={44} className="mx-auto text-[var(--award)]" strokeWidth={1.5} />,
    /*
     * Замена — не отзыв, и говорить о ней надо иначе. Отозванный документ
     * признан недействительным, и предъявителю остаётся идти в организацию.
     * Заменённый же означает исправленную ошибку — в фамилии, в разряде,
     * в дате: действующий документ существует, и человеку нужно всего
     * лишь показать, где он.
     */
    text:
      'Организация выпустила вместо него новый — обычно так исправляют опечатку ' +
      'в имени или в звании. Действителен новый документ.',
  },
  revoked: {
    tone: 'bad',
    title: 'Документ отозван',
    icon: <ShieldX size={44} className="mx-auto text-[var(--danger)]" strokeWidth={1.5} />,
    text: 'Выдавшая организация признала этот документ недействительным.',
  },
};

function Verdict({ data }: { data: VerifyResult }) {
  const verdict = VERDICT[data.state];
  return (
    <>
      <Card tone={verdict.tone}>
        {verdict.icon}
        <h1 className="mt-4 font-serif text-2xl">{verdict.title}</h1>
        {verdict.text && <p className="mt-2 text-[var(--text-muted)]">{verdict.text}</p>}
        {data.state === 'revoked' && (
          <dl className="mt-4 space-y-1 text-left text-sm">
            {data.revokedReason && (
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--text-muted)]">Причина</dt>
                <dd className="text-right font-medium">{data.revokedReason}</dd>
              </div>
            )}
            {data.revokedAt && (
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--text-muted)]">Отозван</dt>
                <dd className="text-right font-medium">{formatDate(data.revokedAt)}</dd>
              </div>
            )}
          </dl>
        )}
        {data.state === 'replaced' &&
          (data.replacedBy ? (
            <Link
              to={data.replacedBy.path}
              className="mt-4 inline-block rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--accent-contrast)] hover:bg-[var(--accent-hover)]"
            >
              Проверить действующий документ
            </Link>
          ) : (
            <p className="mt-3 text-sm text-[var(--text-muted)]">
              Проверить новый документ здесь пока нельзя — обратитесь в выдавшую организацию.
            </p>
          ))}

        <p className="mt-4 font-medium">{data.title}</p>
        {data.event.name && (
          <p className="text-sm text-[var(--text-muted)]">
            {data.event.name}
            {data.event.date ? `, ${data.event.date}` : ''}
          </p>
        )}

        <dl className="mt-6 space-y-2 border-t border-[var(--line)] pt-6 text-left text-sm">
          {Object.entries(data.fields).map(([key, value]) => (
            <div key={key} className="flex justify-between gap-4">
              <dt className="text-[var(--text-muted)]">{fieldLabel(key)}</dt>
              <dd className="text-right font-medium">{value}</dd>
            </div>
          ))}
          <div className="flex justify-between gap-4">
            <dt className="text-[var(--text-muted)]">Выдан</dt>
            <dd className="tabular text-right font-medium">{formatDate(data.issuedAt)}</dd>
          </div>
          {data.expiresAt && (
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--text-muted)]">
                {data.expired ? 'Действовал до' : 'Действителен до'}
              </dt>
              <dd className="tabular text-right font-medium">{formatDate(data.expiresAt)}</dd>
            </div>
          )}
          <div className="flex justify-between gap-4">
            <dt className="text-[var(--text-muted)]">Номер</dt>
            <dd className="text-right font-mono text-xs font-medium">{data.code}</dd>
          </div>
          {data.signed && (
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--text-muted)]">Электронная подпись</dt>
              <dd className="text-right font-medium">Есть — видна в Adobe Reader</dd>
            </div>
          )}
          <div className="flex justify-between gap-4">
            <dt className="text-[var(--text-muted)]">Выдан организацией</dt>
            <dd className="text-right font-medium">
              {data.issuer.publicPath ? (
                <Link to={data.issuer.publicPath} className="text-[var(--accent)] hover:underline">
                  {data.issuer.name}
                </Link>
              ) : (
                data.issuer.name
              )}
              {data.issuer.verified && (
                <span
                  className="ml-1.5 inline-flex items-center gap-1 rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--accent)]"
                  title="Организация подтвердила домен и реквизиты"
                >
                  <ShieldCheck size={11} /> Верифицированный эмитент
                </span>
              )}
            </dd>
          </div>
        </dl>

        <Actions data={data} />
      </Card>

      {data.state !== 'revoked' && <FileCheck expected={data.sha256} />}
    </>
  );
}

/**
 * Кнопки под вердиктом. Скачивания PDF здесь нет намеренно: файл содержит
 * полное имя даже тогда, когда эмитент попросил показывать на странице
 * только инициалы, и отдавать его любому, кто знает код, значило бы
 * обойти эту настройку.
 */
function Actions({ data }: { data: VerifyResult }) {
  const [copied, setCopied] = useState(false);
  const url = typeof window === 'undefined' ? '' : window.location.href;

  async function share() {
    const title = `${data.title} — проверка подлинности`;
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        return;
      }
    } catch {
      // Человек закрыл окно «поделиться» — это не ошибка.
      return;
    }
    await navigator.clipboard?.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  // Сообщить о проблеме — эмитенту, если он оставил адрес: это его документ
  // и его ответственность. Без адреса кнопки нет: выдуманный ящик сервиса
  // хуже её отсутствия — письмо ушло бы в никуда.
  const subject = encodeURIComponent(`Вопрос по документу ${data.code}`);
  const body = encodeURIComponent(`Страница проверки: ${url}\n\nОпишите, что не так:\n`);
  const report = data.issuer.contactEmail
    ? `mailto:${data.issuer.contactEmail}?subject=${subject}&body=${body}`
    : null;

  return (
    <div className="mt-6 flex flex-wrap justify-center gap-2">
      <button
        type="button"
        onClick={() => void share()}
        className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-[var(--text)] ring-1 ring-[var(--line-strong)] hover:bg-[var(--surface-sunken)]"
      >
        {copied ? <Check size={14} /> : <Share2 size={14} />}
        {copied ? 'Ссылка скопирована' : 'Поделиться'}
      </button>
      {report && (
        <a
          href={report}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-[var(--text-muted)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text)]"
        >
          <Flag size={14} />
          Сообщить о проблеме
        </a>
      )}
    </div>
  );
}

type FileVerdict =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'match' }
  | { kind: 'mismatch' }
  | { kind: 'failed' };

/**
 * «Проверить мой файл»: тот ли это PDF, что выпущен.
 *
 * Отпечаток считается прямо в браузере, файл никуда не отправляется —
 * в нём фамилия, а страница открыта всем. Совпал — байты те самые, что
 * выпустил сервис; не совпал — файл изменён после выпуска (или это просто
 * другой файл, скажем, скан).
 */
function FileCheck({ expected }: { expected: string | null }) {
  const [verdict, setVerdict] = useState<FileVerdict>({ kind: 'idle' });
  const input = useRef<HTMLInputElement>(null);

  async function onFile(file: File | undefined) {
    if (!file || !expected) return;
    setVerdict({ kind: 'busy' });
    try {
      const digest = await sha256Hex(await file.arrayBuffer());
      setVerdict({ kind: sameDigest(digest, expected) ? 'match' : 'mismatch' });
    } catch {
      setVerdict({ kind: 'failed' });
    }
  }

  return (
    <section className="mt-4 rounded-2xl bg-[var(--surface)] p-6 ring-1 ring-[var(--line)]">
      <h2 className="flex items-center gap-2 font-medium">
        <FileSearch size={16} className="text-[var(--text-muted)]" />
        Проверить мой файл
      </h2>
      {expected ? (
        <>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Выберите PDF, который вам прислали. Отпечаток считается прямо в браузере — файл
            никуда не отправляется.
          </p>
          <input
            ref={input}
            type="file"
            accept="application/pdf,.pdf,image/jpeg,.jpg"
            className="sr-only"
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => input.current?.click()}
              disabled={verdict.kind === 'busy'}
              className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-[var(--accent-contrast)] hover:bg-[var(--accent-hover)] disabled:opacity-50"
            >
              {verdict.kind === 'busy' ? 'Считаем…' : 'Выбрать файл'}
            </button>
            {verdict.kind === 'match' && (
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--accent)]">
                <Check size={15} /> Файл совпадает с выпущенным
              </span>
            )}
            {verdict.kind === 'mismatch' && (
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--danger)]">
                <X size={15} /> Файл не совпадает с выпущенным
              </span>
            )}
            {verdict.kind === 'failed' && (
              <span className="text-sm text-[var(--danger)]">Не удалось прочитать файл</span>
            )}
          </div>
          {verdict.kind === 'mismatch' && (
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              Так бывает, если файл пересохранили, распечатали и отсканировали или это другой
              документ. Сверьте номер и данные выше с тем, что напечатано.
            </p>
          )}
        </>
      ) : (
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Для этого документа отпечаток файла при выпуске не сохранялся — сверьте номер и данные
          выше с тем, что напечатано.
        </p>
      )}
    </section>
  );
}

/** Пары знаков, которые путают при вводе с бумаги. */
const CONFUSABLES = ['0 и O', '1 и I', '1 и L', '5 и S', '8 и B', '2 и Z'];

/**
 * «Не найдено» — человеческая страница, а не голый 404.
 *
 * Причину сервер выводит из одного лишь введённого кода, поэтому
 * подсказка не говорит ничего о чужих документах: «похоже на опечатку»
 * означает, что код не сходится сам с собой, а не что рядом есть чей-то.
 */
function NotFound({ reason, typed }: { reason: NotFoundReason; typed: string }) {
  const text =
    reason === 'malformed'
      ? 'Это не похоже на код документа. Код с бланка выглядит как K7M2-9QXR-4TVB — три группы по четыре знака.'
      : reason === 'checksum'
        ? 'Похоже, в коде опечатка: он не сходится сам с собой. Сверьте каждый знак с бланком.'
        : 'Такого документа нет, либо проверка по нему закрыта выдавшей организацией. Проверьте код на бланке.';

  return (
    <Card tone="muted">
      <ShieldAlert size={44} className="mx-auto text-[var(--text-muted)]" strokeWidth={1.5} />
      <h1 className="mt-4 font-serif text-2xl">Документ не найден</h1>
      <p className="mt-2 text-[var(--text-muted)]">{text}</p>
      {typed && (
        <p className="mt-3 font-mono text-sm text-[var(--text)]">{typed}</p>
      )}
      <p className="mt-4 text-xs text-[var(--text-muted)]">
        Чаще всего путают: {CONFUSABLES.join(', ')}. В коде нет букв I, L, O и U — на их месте
        всегда цифры.
      </p>
    </Card>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * Человеческая подпись поля.
 *
 * Колонки таблицы называет сама организация, и в них латиница: «name»,
 * «place». Показывать их постороннему, который проверяет грамоту, нельзя —
 * страница выглядит недоделанной, а слова эти ему ничего не говорят.
 *
 * Известные переводим, остальные показываем с заглавной буквы: придумывать
 * описания чужим словам мы не можем, но и оставлять их в исходном виде
 * незачем.
 */
function fieldLabel(key: string): string {
  const known: Record<string, string> = {
    name: 'Кому выдан',
    fio: 'Кому выдан',
    place: 'Результат',
    result: 'Результат',
    club: 'Клуб',
    team: 'Команда',
    city: 'Город',
    event: 'Мероприятие',
    course: 'Программа',
    date: 'Дата',
    hours: 'Часов',
  };
  if (known[key]) return known[key];
  return key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ');
}
