import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Building2, Globe, Mail, Phone, Search, ShieldCheck } from 'lucide-react';
import { Meta } from '../seo/Meta';

interface Program {
  id: string;
  title: string;
  eventName: string;
  eventDate: string;
  issued: number;
  firstIssuedAt: string | null;
  lastIssuedAt: string | null;
}

interface IssuerPageData {
  name: string;
  slug: string | null;
  description: string;
  inn: string;
  website: string;
  contactEmail: string;
  contactPhone: string;
  logoUrl: string | null;
  verified: boolean;
  verifiedAt: string | null;
  indexable: boolean;
  searchByName: boolean;
  programs: Program[];
}

interface NameMatch {
  code: string;
  path: string;
  name: string;
  title: string;
  eventName: string;
  eventDate: string;
  issuedAt: string;
  state: 'valid' | 'revoked' | 'replaced' | 'expired';
}

const STATE_LABEL: Record<NameMatch['state'], string> = {
  valid: 'действителен',
  revoked: 'отозван',
  replaced: 'заменён',
  expired: 'срок истёк',
};

/**
 * Публичная страница организации — то, что первым спрашивают HR
 * и приёмные комиссии: кто выдаёт, что выдаёт, как проверить.
 *
 * Открыта без входа и показывается только по решению самой организации.
 * Поиск по номеру документа есть всегда; поиск по фамилии — только если
 * эмитент включил его и подтвердил, что собрал согласия участников
 * (ст. 10.1 152-ФЗ): без этого поле поиска не появляется вовсе.
 */
export function IssuerPage() {
  const { slug = '' } = useParams();
  const [page, setPage] = useState<IssuerPageData | null | 'missing'>(null);

  useEffect(() => {
    let alive = true;
    setPage(null);
    fetch(`/api/v1/public/org/${encodeURIComponent(slug)}`, { credentials: 'omit' })
      .then(async (res) => {
        if (!alive) return;
        setPage(res.ok ? ((await res.json()) as IssuerPageData) : 'missing');
      })
      .catch(() => alive && setPage('missing'));
    return () => {
      alive = false;
    };
  }, [slug]);

  if (page === null) {
    return <p className="p-10 text-center text-[var(--text-muted)]">Открываем…</p>;
  }

  if (page === 'missing') {
    return (
      <>
        <Meta
          title="Организация не найдена — Вручай"
          description="Публичная страница организации в сервисе Вручай."
          path={`/org/${slug}`}
          noindex
        />
        <div className="grid min-h-full place-items-center bg-[var(--ground)] px-6 py-16">
          <main className="w-full max-w-md rounded-2xl bg-[var(--surface)] p-8 text-center ring-1 ring-[var(--line)]">
            <Building2 size={40} className="mx-auto text-[var(--text-muted)]" strokeWidth={1.5} />
            <h1 className="mt-4 font-serif text-2xl">Страница не найдена</h1>
            <p className="mt-2 text-[var(--text-muted)]">
              Такой организации нет, либо она не открыла публичную страницу. Проверить документ
              можно по его коду.
            </p>
            <Link to="/" className="mt-4 inline-block text-sm text-[var(--accent)] hover:underline">
              На главную
            </Link>
          </main>
        </div>
      </>
    );
  }

  return (
    <>
      <Meta
        title={`${page.name} — реестр документов`}
        description={
          page.description ||
          `Документы, выданные организацией ${page.name}: проверка подлинности по номеру.`
        }
        path={`/org/${slug}`}
        noindex={!page.indexable}
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'Organization',
          name: page.name,
          ...(page.website ? { url: page.website } : {}),
          ...(page.inn ? { taxID: page.inn } : {}),
        }}
      />
      <div className="min-h-full bg-[var(--ground)] px-6 py-12">
        <main className="mx-auto max-w-3xl space-y-8">
          <header className="flex flex-wrap items-start gap-5">
            {page.logoUrl ? (
              <img
                src={page.logoUrl}
                alt=""
                className="h-20 w-20 rounded-2xl bg-[var(--surface)] object-contain p-2 ring-1 ring-[var(--line)]"
              />
            ) : (
              <div className="grid h-20 w-20 place-items-center rounded-2xl bg-[var(--surface)] ring-1 ring-[var(--line)]">
                <Building2 size={32} className="text-[var(--text-muted)]" strokeWidth={1.5} />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <h1 className="font-serif text-3xl">{page.name}</h1>
              {page.verified && (
                <p
                  className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-[var(--accent-soft)] px-2.5 py-1 text-xs font-medium text-[var(--accent)]"
                  title="Домен и реквизиты организации проверены сервисом"
                >
                  <ShieldCheck size={13} /> Верифицированный эмитент
                </p>
              )}
              {page.description && (
                <p className="mt-3 whitespace-pre-line text-[var(--text)]">{page.description}</p>
              )}
              <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-[var(--text-muted)]">
                {page.inn && (
                  <div className="flex gap-1.5">
                    <dt>ИНН</dt>
                    <dd className="font-medium text-[var(--text)]">{page.inn}</dd>
                  </div>
                )}
                {page.website && (
                  <div className="flex items-center gap-1.5">
                    <Globe size={14} />
                    <a
                      href={page.website}
                      rel="noopener noreferrer nofollow"
                      target="_blank"
                      className="text-[var(--accent)] hover:underline"
                    >
                      {page.website.replace(/^https?:\/\//, '')}
                    </a>
                  </div>
                )}
                {page.contactEmail && (
                  <div className="flex items-center gap-1.5">
                    <Mail size={14} />
                    <a
                      href={`mailto:${page.contactEmail}`}
                      className="text-[var(--accent)] hover:underline"
                    >
                      {page.contactEmail}
                    </a>
                  </div>
                )}
                {page.contactPhone && (
                  <div className="flex items-center gap-1.5">
                    <Phone size={14} />
                    <span>{page.contactPhone}</span>
                  </div>
                )}
              </dl>
            </div>
          </header>

          <DocumentSearch slug={slug} byName={page.searchByName} />

          <section>
            <h2 className="font-serif text-xl">Программы и мероприятия</h2>
            {page.programs.length === 0 ? (
              <p className="mt-2 text-sm text-[var(--text-muted)]">
                Выданных документов, открытых для проверки, пока нет.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-[var(--line)] rounded-2xl bg-[var(--surface)] ring-1 ring-[var(--line)]">
                {page.programs.map((program) => (
                  <li
                    key={program.id}
                    className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-4 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{program.title}</p>
                      {(program.eventName || program.eventDate) && (
                        <p className="text-sm text-[var(--text-muted)]">
                          {program.eventName}
                          {program.eventName && program.eventDate ? ', ' : ''}
                          {program.eventDate}
                        </p>
                      )}
                    </div>
                    <p className="text-sm text-[var(--text-muted)] tabular-nums">
                      выдано {program.issued.toLocaleString('ru-RU')}
                      {program.lastIssuedAt
                        ? `, последний ${formatDate(program.lastIssuedAt)}`
                        : ''}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <p className="text-center text-sm text-[var(--text-muted)]">
            Реестр ведётся сервисом{' '}
            <Link to="/" className="text-[var(--accent)] hover:underline">
              Вручай
            </Link>
            . Подлинность каждого документа подтверждается его страницей проверки.
          </p>
        </main>
      </div>
    </>
  );
}

/**
 * Поиск документа. По номеру — всегда; по фамилии — только если эмитент
 * включил это в настройках. Второе поле не «спрятано», его нет: страница
 * не должна намекать, что поиск по фамилии существует, но закрыт.
 */
function DocumentSearch({ slug, byName }: { slug: string; byName: boolean }) {
  const navigate = useNavigate();
  const [mode, setMode] = useState<'code' | 'name'>('code');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [matches, setMatches] = useState<NameMatch[] | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const value = query.trim();
    if (!value) return;
    setBusy(true);
    setError('');
    setMatches(null);
    try {
      const param =
        mode === 'code' ? `code=${encodeURIComponent(value)}` : `name=${encodeURIComponent(value)}`;
      const res = await fetch(`/api/v1/public/org/${encodeURIComponent(slug)}/search?${param}`, {
        credentials: 'omit',
      });
      if (res.status === 429) {
        setError('Слишком много запросов — подождите минуту.');
        return;
      }
      if (mode === 'code') {
        if (!res.ok) {
          setError(
            'Документ с таким номером этой организацией не выдавался. Проверьте номер на бланке.',
          );
          return;
        }
        const { path } = (await res.json()) as { path: string };
        navigate(path);
        return;
      }
      if (!res.ok) {
        setError('Поиск по имени недоступен.');
        return;
      }
      const { items } = (await res.json()) as { items: NameMatch[] };
      setMatches(items);
    } catch {
      setError('Не удалось выполнить поиск — попробуйте ещё раз.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl bg-[var(--surface)] p-5 ring-1 ring-[var(--line)]">
      <h2 className="flex items-center gap-2 font-medium">
        <Search size={16} className="text-[var(--text-muted)]" />
        Проверить документ
      </h2>
      {byName && (
        <div
          role="tablist"
          className="mt-3 inline-flex rounded-lg bg-[var(--surface-sunken)] p-0.5 text-sm"
        >
          {(
            [
              ['code', 'По номеру'],
              ['name', 'По фамилии'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={mode === value}
              onClick={() => {
                setMode(value);
                setMatches(null);
                setError('');
              }}
              className={`rounded-md px-3 py-1 ${
                mode === value ? 'bg-[var(--surface)] font-medium' : 'text-[var(--text-muted)]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      <form onSubmit={(e) => void submit(e)} className="mt-3 flex flex-wrap gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={mode === 'code' ? 'K7M2-9QXR-4TVB' : 'Фамилия и имя'}
          aria-label={mode === 'code' ? 'Номер документа' : 'Фамилия и имя'}
          className="min-w-0 flex-1 rounded-lg bg-[var(--surface)] px-3 py-2 ring-1 ring-[var(--line-strong)] outline-none placeholder:text-[var(--text-muted)] focus:ring-2 focus:ring-[var(--focus)]"
          maxLength={mode === 'code' ? 64 : 200}
        />
        <button
          type="submit"
          disabled={busy || !query.trim()}
          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--accent-contrast)] hover:bg-[var(--accent-hover)] disabled:opacity-50"
        >
          {busy ? 'Ищем…' : 'Найти'}
        </button>
      </form>
      <p className="mt-2 text-xs text-[var(--text-muted)]">
        {mode === 'code'
          ? 'Номер напечатан на документе рядом с QR-кодом. Буквы O, I и L в нём не встречаются — это цифры 0 и 1.'
          : 'Показываются документы, выданные этой организацией. Имя — так, как разрешила показывать организация.'}
      </p>
      {error && (
        <p role="alert" className="mt-3 text-sm text-[var(--danger)]">
          {error}
        </p>
      )}
      {matches && (
        <ul className="mt-3 divide-y divide-[var(--line)] text-sm">
          {matches.length === 0 && (
            <li className="py-2 text-[var(--text-muted)]">Ничего не найдено</li>
          )}
          {matches.map((m) => (
            <li key={m.code} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2">
              <Link to={m.path} className="font-medium text-[var(--accent)] hover:underline">
                {m.name || m.code}
              </Link>
              <span className="text-[var(--text-muted)]">
                {m.title}
                {m.eventName ? `, ${m.eventName}` : ''} · {formatDate(m.issuedAt)} ·{' '}
                {STATE_LABEL[m.state]}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}
