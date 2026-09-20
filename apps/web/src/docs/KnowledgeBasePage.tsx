import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  ExternalLink,
  FileText,
  Search,
} from 'lucide-react';
import { Input } from '../ui/Field';
import { Meta } from '../seo/Meta';
import { Button } from '../ui/Button';
import { Menu, MenuDivider, MenuItem } from '../ui/Menu';
import { Tabs } from '../ui/Tabs';
import { SectionLayout, SectionTitle } from '../ui/SectionLayout';
import { cn } from '../ui/cn';
import { CodeBlock, renderDoc } from './markdown';
import { HOME_SLUG, findPage, groups, loadBody, type DocGroup, type DocPage } from './content';
import { SITE } from './prompt';
import { MethodPill } from './method';
import { splitDoc, type SplitDoc } from './panel';
import { DocsHome } from './DocsHome';

/**
 * База знаний: справочник по API, тот же, что лежит в docs/api.
 *
 * Раздел открыт без входа намеренно. Решение «подойдёт ли нам сервис»
 * принимают до регистрации, а читает эти страницы чаще не человек,
 * а его ИИ-помощник — ему кабинет не выдашь.
 *
 * Устроена как справочники Stripe и Mintlify: колонка с двумя вкладками
 * («Начало» и «API»), текст посередине, запрос и ответ в панели справа,
 * меню «Скопировать» для ИИ на каждой странице.
 */

const BASE_PATH = '/docs';

type Tab = 'guides' | 'api';

/** Подпись способа доступа — по ней сразу видно, нужен ли токен. */
const AUTH_LABEL: Record<string, string> = {
  token: 'по токену',
  public: 'без токена',
  'humans-only': 'только из кабинета',
};

function matches(page: DocPage, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [page.title, page.slug, page.meta.path ?? '', page.meta.method ?? '']
    .join(' ')
    .toLowerCase()
    .includes(needle);
}

function tabOf(slug: string): Tab {
  return slug.startsWith('endpoints/') ? 'api' : 'guides';
}

const menuLink =
  'flex w-full items-center gap-2.5 rounded-control px-2.5 py-2 text-[15px] hover:bg-sunken pointer-coarse:min-h-12';

/** `embedded` — внутри оболочки кабинета: без своей шапки, колонка липнет под шапку кабинета. */
export function KnowledgeBasePage({ embedded = false }: { embedded?: boolean }) {
  const params = useParams();
  const slug = params['*']?.replace(/\/$/, '') || HOME_SLUG;
  const page = findPage(slug) ?? findPage(HOME_SLUG);

  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<Tab>(() => tabOf(slug));
  useEffect(() => setTab(tabOf(slug)), [slug]);

  const all = useMemo(() => groups(), []);
  const apiGroups = useMemo(
    () => all.filter((g) => g.key !== 'guides' && g.key !== 'reference'),
    [all],
  );

  // Текст страницы приезжает отдельным куском сборки: оглавление лёгкое,
  // а весь справочник в главный кусок не помещается.
  const [raw, setRaw] = useState<string | null>(null);
  useEffect(() => {
    if (!page) return;
    let current = true;
    setRaw(null);
    void loadBody(page.slug).then((text) => {
      if (current) setRaw(text);
    });
    // Пока грузится следующая страница, предыдущая не должна дорисоваться
    // поверх неё: человек кликает по оглавлению быстрее, чем идёт загрузка.
    return () => {
      current = false;
    };
  }, [page]);

  const endpoint = Boolean(page?.meta.method);
  const doc = useMemo<SplitDoc | null>(
    () => (raw === null ? null : splitDoc(raw, endpoint)),
    [raw, endpoint],
  );
  const home = page?.slug === HOME_SLUG;

  const searching = Boolean(query.trim());
  const navGroups = searching
    ? all
    : tab === 'api'
      ? apiGroups
      : all.filter((g) => g.key === 'guides' || g.key === 'reference');

  const column = (
    <div className="flex flex-col gap-3">
      <Tabs<Tab>
        items={[
          { id: 'guides', label: 'Начало' },
          { id: 'api', label: 'API' },
        ]}
        value={tab}
        onChange={setTab}
        label="Разделы документации"
        stretch
      />
      <label className="relative block">
        <Search
          size={15}
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted"
        />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск"
          aria-label="Поиск по документации"
          className="py-1.5 pl-9 text-sm"
        />
      </label>
      <Nav groups={navGroups} query={query} current={page?.slug} />
    </div>
  );

  const crumbs = page && !home && (
    <span className="flex min-w-0 items-center gap-1.5 text-sm text-muted">
      <Link to={BASE_PATH} className="shrink-0 hover:text-ink">
        База знаний
      </Link>
      <ChevronRight size={14} className="shrink-0" />
      <span className="truncate">{groupTitle(all, page.slug)}</span>
    </span>
  );

  const article = (
    <>
      {page && !home && (
        <header className="mb-6">
          <h1 className="text-2xl font-medium text-balance">{page.title}</h1>
          {page.meta.method && page.meta.path && (
            <PathLine method={page.meta.method} path={page.meta.path} />
          )}
          {endpoint && (
            <div className="mt-3 flex flex-wrap gap-1.5 text-xs text-muted">
              {page.meta.auth && <Chip>{AUTH_LABEL[page.meta.auth] ?? page.meta.auth}</Chip>}
              {page.meta.roles && page.meta.roles !== 'any' && (
                <Chip>роль: {page.meta.roles}</Chip>
              )}
              {page.meta.rate_limit && page.meta.rate_limit !== 'none' && (
                <Chip>{page.meta.rate_limit}</Chip>
              )}
            </div>
          )}
        </header>
      )}

      {raw === null || !page || !doc ? (
        <Loading />
      ) : home ? (
        <DocsHome body={raw} groups={apiGroups} basePath={BASE_PATH} />
      ) : (
        <div className="max-w-2xl text-[15px] leading-relaxed">
          {renderDoc(doc.body, { basePath: BASE_PATH, slug: page.slug })}
        </div>
      )}
    </>
  );

  const aside =
    doc && page && !home ? endpoint ? <CodePanel doc={doc} /> : <Toc doc={doc} /> : null;

  return (
    <>
      <Meta
        title={
          page && !home
            ? `${page.title} — API «Вручай»`
            : 'База знаний и документация API — Вручай'
        }
        description="Справочник по API «Вручай»: выпуск именных документов из таблицы, токены, ограничения и коды ошибок. Готов к чтению ИИ-помощником."
        path={page && !home ? `${BASE_PATH}/${page.slug}` : BASE_PATH}
      />

      {/* Гостю шапка кабинета не показывается — своя, той же роли, чтобы
          липкие колонки считали место от неё. */}
      <div
        className="flex min-h-full flex-1 flex-col bg-ground"
        style={embedded ? undefined : ({ '--app-header': '57px' } as CSSProperties)}
      >
        {!embedded && (
          <header className="sticky top-0 z-20 border-b border-line bg-surface">
            <div className="flex h-14 items-center gap-3 px-6">
              <Link
                to="/"
                className="inline-flex items-center gap-2 text-sm text-muted hover:text-ink"
              >
                <ArrowLeft size={16} />
                Вручай
              </Link>
              <span className="text-line-strong">/</span>
              <Link to={BASE_PATH} className="text-sm font-medium">
                База знаний
              </Link>
            </div>
          </header>
        )}

        <SectionLayout
          columnTitle="Документация"
          column={column}
          head={crumbs || <SectionTitle>База знаний</SectionTitle>}
          tools={page && raw !== null ? <CopyMenu page={page} raw={raw} /> : undefined}
        >
          <div className={cn('grid gap-10', aside && 'xl:grid-cols-[minmax(0,1fr)_22rem]')}>
            <article className="min-w-0">
              {article}
              {aside && endpoint && <div className="mt-8 xl:hidden">{aside}</div>}
            </article>
            {aside && (
              <div className="max-xl:hidden">
                <div className="sticky top-[calc(var(--app-header)+4.5rem)]">{aside}</div>
              </div>
            )}
          </div>
        </SectionLayout>
      </div>
    </>
  );
}

function Loading() {
  return (
    <div className="space-y-3" aria-busy>
      <div className="h-6 w-2/3 animate-pulse rounded bg-sunken" />
      <div className="h-4 w-full animate-pulse rounded bg-sunken" />
      <div className="h-4 w-5/6 animate-pulse rounded bg-sunken" />
    </div>
  );
}

function groupTitle(all: DocGroup[], slug: string): string {
  return all.find((g) => g.pages.some((p) => p.slug === slug))?.title ?? 'Документация';
}

function Chip({ children }: { children: ReactNode }) {
  return <span className="rounded-md bg-sunken px-2 py-0.5">{children}</span>;
}

/** Метод и путь под заголовком, с копированием пути. */
function PathLine({ method, path }: { method: string; path: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(path);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        } catch {
          // Буфер закрыт настройками браузера.
        }
      }}
      aria-label={`Скопировать путь ${path}`}
      className="mt-2 inline-flex max-w-full items-center gap-2 rounded-control bg-sunken px-2.5 py-1.5 font-mono text-[13px] transition-colors hover:bg-row-hover"
    >
      <MethodPill method={method} size="md" />
      <span className="truncate">{path}</span>
      {copied ? (
        <Check size={13} className="shrink-0 text-ok" />
      ) : (
        <Copy size={13} className="shrink-0 text-muted" />
      )}
    </button>
  );
}

/**
 * Колонка: группы сворачиваются, открыта только та, где текущая страница.
 * При поиске открыто всё — иначе найденное не видно.
 */
function Nav({
  groups: list,
  query,
  current,
}: {
  groups: DocGroup[];
  query: string;
  current?: string;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const currentGroup = list.find((g) => g.pages.some((p) => p.slug === current))?.key;
  const searching = Boolean(query.trim());

  const visible = list
    .map((g) => ({ ...g, pages: g.pages.filter((p) => matches(p, query)) }))
    .filter((g) => g.pages.length > 0);

  if (visible.length === 0) {
    return <p className="px-2 text-sm text-muted">Ничего не нашлось.</p>;
  }

  return (
    <nav aria-label="Страницы документации" className="flex flex-col gap-1">
      {visible.map((group) => {
        const collapsible = group.key !== 'guides' && group.key !== 'reference' && !searching;
        const expanded = !collapsible || (open[group.key] ?? group.key === currentGroup);
        return (
          <div key={group.key}>
            {collapsible ? (
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => setOpen((s) => ({ ...s, [group.key]: !expanded }))}
                className="flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-left text-[13px] font-medium text-ink hover:bg-row-hover max-md:min-h-11 max-md:text-base"
              >
                <ChevronRight
                  size={14}
                  className={cn(
                    'shrink-0 text-muted transition-transform',
                    expanded && 'rotate-90',
                  )}
                />
                <span className="flex-1 truncate">{group.title}</span>
                <span className="tabular text-xs text-muted">{group.pages.length}</span>
              </button>
            ) : (
              <p className="px-2 pt-2 pb-1 text-xs font-medium tracking-wide text-muted uppercase">
                {group.title}
              </p>
            )}
            {expanded && (
              <ul className="flex flex-col gap-px">
                {group.pages.map((item) => {
                  const active = item.slug === current;
                  return (
                    <li key={item.slug}>
                      <Link
                        to={`${BASE_PATH}/${item.slug}`}
                        aria-current={active ? 'page' : undefined}
                        className={cn(
                          'flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] max-md:min-h-11 max-md:text-base',
                          collapsible && 'pl-4',
                          active
                            ? 'bg-accent-soft font-medium text-accent'
                            : 'text-muted hover:bg-row-hover hover:text-ink',
                        )}
                      >
                        {item.meta.method ? (
                          <MethodPill method={item.meta.method} />
                        ) : (
                          <FileText size={14} className="shrink-0 opacity-70" />
                        )}
                        <span className="truncate">{item.title}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </nav>
  );
}

/** Запрос и ответы справа от текста — на широком экране липкие. */
function CodePanel({ doc }: { doc: SplitDoc }) {
  if (!doc.request && doc.responses.length === 0) return null;
  return (
    <div className="flex flex-col gap-3 [&_[data-code]]:my-0">
      {doc.request && (
        <CodeBlock label="Запрос" lang={doc.request.lang} code={doc.request.code} />
      )}
      {doc.responses.map((r, i) => (
        <CodeBlock
          key={i}
          label={/^\d/.test(r.label) ? `Ответ · ${r.label}` : r.label}
          lang={r.lang}
          code={r.code}
        />
      ))}
    </div>
  );
}

/** «На этой странице» у вводных страниц. */
function Toc({ doc }: { doc: SplitDoc }) {
  if (doc.toc.length < 2) return null;
  return (
    <nav aria-label="На этой странице" className="text-sm">
      <p className="mb-2 text-xs font-medium tracking-wide text-muted uppercase">
        На этой странице
      </p>
      <ul className="flex flex-col border-l border-line">
        {doc.toc.map((h) => (
          <li key={h.id}>
            <a
              href={`#${h.id}`}
              className="-ml-px block border-l border-transparent py-1 pl-3 text-muted hover:border-accent hover:text-ink"
            >
              {h.title}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * «Скопировать ▾»: страница как Markdown, открыть в Claude или ChatGPT,
 * файлы для ИИ. Так теперь устроены Mintlify, Vercel и Fern — кнопка
 * заменила «Edit on GitHub».
 */
function CopyMenu({ page, raw }: { page: DocPage; raw: string }) {
  const [copied, setCopied] = useState(false);
  const url = `${SITE}${BASE_PATH}${page.slug === HOME_SLUG ? '' : `/${page.slug}`}`;
  const ask = `Прочитай ${SITE}/llms-full.txt — документацию API сервиса «Вручай» — и помоги мне со страницей «${page.title}» (${url}).`;

  const copyMarkdown = async () => {
    try {
      await navigator.clipboard.writeText(`# ${page.title}\n\n${raw}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Буфер закрыт настройками браузера.
    }
  };

  return (
    <Menu
      title="Скопировать"
      trigger={({ open, toggle }) => (
        <Button
          size="sm"
          onClick={toggle}
          aria-haspopup="menu"
          aria-expanded={open}
          icon={copied ? <Check size={14} className="text-ok" /> : <Copy size={14} />}
        >
          {copied ? 'Скопировано' : 'Скопировать'}
          <ChevronDown size={14} className="-mr-1 text-muted" />
        </Button>
      )}
    >
      <MenuItem onClick={copyMarkdown} icon={<Copy size={16} strokeWidth={1.75} />}>
        Как Markdown
      </MenuItem>
      <MenuDivider />
      <a
        role="menuitem"
        href={`https://claude.ai/new?q=${encodeURIComponent(ask)}`}
        target="_blank"
        rel="noopener noreferrer"
        className={menuLink}
      >
        <ExternalLink size={16} strokeWidth={1.75} /> Открыть в Claude
      </a>
      <a
        role="menuitem"
        href={`https://chatgpt.com/?q=${encodeURIComponent(ask)}`}
        target="_blank"
        rel="noopener noreferrer"
        className={menuLink}
      >
        <ExternalLink size={16} strokeWidth={1.75} /> Открыть в ChatGPT
      </a>
      <MenuDivider />
      <a role="menuitem" href={`${SITE}/llms.txt`} className={menuLink}>
        <FileText size={16} strokeWidth={1.75} /> llms.txt
      </a>
      <a role="menuitem" href={`${SITE}/llms-full.txt`} className={menuLink}>
        <FileText size={16} strokeWidth={1.75} /> llms-full.txt — всё одним файлом
      </a>
    </Menu>
  );
}
