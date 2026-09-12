import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Bot, Check, Copy, FileText, Search } from 'lucide-react';
import { Input } from '../ui/Field';
import { Meta } from '../seo/Meta';
import { Button } from '../ui/Button';
import { renderDoc } from './markdown';
import { PAGES, HOME_SLUG, findPage, groups, loadBody, type DocPage } from './content';
import { integrationPrompt, SITE } from './prompt';

/**
 * База знаний: справочник по API, тот же, что лежит в docs/api.
 *
 * Раздел открыт без входа намеренно. Решение «подойдёт ли нам сервис»
 * принимают до регистрации, а читает эти страницы чаще не человек,
 * а его ИИ-помощник — ему кабинет не выдашь.
 */

const BASE_PATH = '/docs';

/** Цвет и подпись способа доступа — по нему сразу видно, нужен ли токен. */
const AUTH_BADGES: Record<string, { label: string; className: string }> = {
  token: { label: 'по токену', className: 'bg-[var(--accent-soft)] text-[var(--accent)]' },
  public: { label: 'без токена', className: 'bg-[var(--award-soft)] text-[var(--award)]' },
  'humans-only': {
    label: 'только из кабинета',
    className: 'bg-[var(--danger-soft)] text-[var(--danger)]',
  },
};

function matches(page: DocPage, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [page.title, page.slug, page.meta.path ?? '', page.meta.method ?? '']
    .join(' ')
    .toLowerCase()
    .includes(needle);
}

/** `embedded` — внутри оболочки кабинета: без своей шапки, колонка липнет под шапку кабинета. */
export function KnowledgeBasePage({ embedded = false }: { embedded?: boolean }) {
  const params = useParams();
  const slug = params['*']?.replace(/\/$/, '') || HOME_SLUG;
  const [query, setQuery] = useState('');
  const [copied, setCopied] = useState(false);

  const page = findPage(slug) ?? findPage(HOME_SLUG);
  const visible = useMemo(() => PAGES.filter((p) => matches(p, query)), [query]);
  const nav = useMemo(() => groups(visible), [visible]);

  // Текст страницы приезжает отдельным куском сборки: оглавление лёгкое,
  // а весь справочник в главный кусок не помещается.
  const [body, setBody] = useState<string | null>(null);

  useEffect(() => {
    if (!page) return;

    let current = true;
    setBody(null);
    void loadBody(page.slug).then((text) => {
      if (current) setBody(text);
    });

    // Пока грузится следующая страница, предыдущая не должна дорисоваться
    // поверх неё: человек кликает по оглавлению быстрее, чем идёт загрузка.
    return () => {
      current = false;
    };
  }, [page]);

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(integrationPrompt());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Буфер обмена может быть закрыт настройками браузера — тогда человек
      // выделит текст руками, он показан на странице целиком.
    }
  };

  return (
    <>
      <Meta
        title={
          page && page.slug !== HOME_SLUG
            ? `${page.title} — API «Вручай»`
            : 'База знаний и документация API — Вручай'
        }
        description="Справочник по API «Вручай»: выпуск именных документов из таблицы, токены, ограничения и коды ошибок. Готов к чтению ИИ-помощником."
        path={page && page.slug !== HOME_SLUG ? `${BASE_PATH}/${page.slug}` : BASE_PATH}
      />

      <div className="min-h-full bg-[var(--ground)]">
        {!embedded && (
        <header className="border-b border-[var(--line)] bg-[var(--surface)]">
          <div className="mx-auto flex max-w-6xl items-center gap-3 px-6 py-3">
            <Link
              to="/"
              className="inline-flex items-center gap-2 text-sm text-[var(--text-muted)] hover:text-[var(--text)]"
            >
              <ArrowLeft size={16} />
              Вручай
            </Link>
            <span className="text-[var(--line-strong)]">/</span>
            <Link to={BASE_PATH} className="text-sm font-medium">
              База знаний
            </Link>
          </div>
        </header>
        )}

        <div
          className={`flex max-w-6xl flex-col gap-8 px-6 py-8 md:flex-row ${embedded ? '' : 'mx-auto'}`}
        >
          <nav
            className={`w-full shrink-0 md:sticky md:w-64 md:overflow-y-auto ${
              embedded
                ? 'md:top-[calc(var(--app-header)+2rem)] md:max-h-[calc(100vh-var(--app-header)-4rem)]'
                : 'md:top-8 md:max-h-[calc(100vh-6rem)]'
            }`}
          >
            <label className="relative mb-4 block">
              <Search
                size={15}
                className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[var(--text-muted)]"
              />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Поиск по адресу или названию"
                aria-label="Поиск по документации"
                className="py-2 pl-9 text-sm"
              />
            </label>

            {nav.length === 0 && (
              <p className="text-sm text-[var(--text-muted)]">Ничего не нашлось.</p>
            )}

            {nav.map((group) => (
              <div key={group.key} className="mb-5">
                <p className="mb-1.5 text-xs font-medium tracking-wide text-[var(--text-muted)] uppercase">
                  {group.title}
                </p>
                <ul className="space-y-0.5">
                  {group.pages.map((item) => {
                    const active = item.slug === page?.slug;
                    return (
                      <li key={item.slug}>
                        <Link
                          to={`${BASE_PATH}/${item.slug}`}
                          aria-current={active ? 'page' : undefined}
                          className={`block rounded-lg px-3 py-1.5 text-sm ${
                            active
                              ? 'bg-[var(--accent-soft)] font-medium text-[var(--accent)]'
                              : 'text-[var(--text-muted)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text)]'
                          }`}
                        >
                          {item.meta.method ? (
                            <span className="font-mono text-[0.7rem] text-[var(--text-muted)]">
                              {item.meta.method}{' '}
                            </span>
                          ) : null}
                          {item.title}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>

          <main className="min-w-0 flex-1">
            {page?.slug === HOME_SLUG && (
              <section className="card mb-8 p-5">
                <h2 className="mb-1 flex items-center gap-2 text-lg font-medium">
                  <Bot size={18} className="text-[var(--accent)]" />
                  Отдайте это своему ИИ
                </h2>
                <p className="mb-4 text-sm text-[var(--text-muted)]">
                  Документация написана так, чтобы её читал не только человек. Скопируйте промпт,
                  вставьте свой токен и приложите таблицу — помощник настроит выпуск сам.
                </p>

                <pre className="mb-4 max-h-56 overflow-auto rounded-xl bg-[var(--surface-sunken)] p-4 text-[0.8125rem] leading-relaxed whitespace-pre-wrap">
                  <code className="font-mono">{integrationPrompt()}</code>
                </pre>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="primary"
                    onClick={copyPrompt}
                    icon={copied ? <Check size={15} /> : <Copy size={15} />}
                  >
                    {copied ? 'Скопировано' : 'Скопировать промпт'}
                  </Button>
                  <a
                    href={`${SITE}/llms.txt`}
                    className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-[var(--text-muted)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text)]"
                  >
                    <FileText size={15} />
                    llms.txt
                  </a>
                  <a
                    href={`${SITE}/llms-full.txt`}
                    className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-[var(--text-muted)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text)]"
                  >
                    <FileText size={15} />
                    llms-full.txt — всё одним файлом
                  </a>
                </div>
              </section>
            )}

            {page ? (
              <article className="max-w-3xl">
                {(page.meta.method || page.meta.auth) && (
                  <div className="mb-5 flex flex-wrap items-center gap-2 text-xs">
                    {page.meta.method && page.meta.path && (
                      <code className="rounded-md bg-[var(--surface-sunken)] px-2 py-1 font-mono">
                        <span className="font-semibold text-[var(--accent)]">
                          {page.meta.method}
                        </span>{' '}
                        {page.meta.path}
                      </code>
                    )}
                    {page.meta.auth && AUTH_BADGES[page.meta.auth] && (
                      <span
                        className={`rounded-md px-2 py-1 ${AUTH_BADGES[page.meta.auth].className}`}
                      >
                        {AUTH_BADGES[page.meta.auth].label}
                      </span>
                    )}
                    {page.meta.roles && page.meta.roles !== 'any' && (
                      <span className="rounded-md bg-[var(--surface-sunken)] px-2 py-1 text-[var(--text-muted)]">
                        роль: {page.meta.roles}
                      </span>
                    )}
                    {page.meta.rate_limit && page.meta.rate_limit !== 'none' && (
                      <span className="rounded-md bg-[var(--surface-sunken)] px-2 py-1 text-[var(--text-muted)]">
                        {page.meta.rate_limit}
                      </span>
                    )}
                  </div>
                )}

                {body === null ? (
                  <p className="text-sm text-[var(--text-muted)]">Загружаем…</p>
                ) : (
                  renderDoc(body, { basePath: BASE_PATH, slug: page.slug })
                )}
              </article>
            ) : (
              <p className="text-sm text-[var(--text-muted)]">
                Документация ещё не собрана. Выполните <code>node scripts/sync-api-docs.mjs</code>.
              </p>
            )}
          </main>
        </div>
      </div>
    </>
  );
}
