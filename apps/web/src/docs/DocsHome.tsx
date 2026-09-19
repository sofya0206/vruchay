import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Bot, Check, Copy, FileText } from 'lucide-react';
import { Button } from '../ui/Button';
import { CodeBlock, renderDoc } from './markdown';
import { leadOf, sectionOf } from './panel';
import { integrationPrompt, SITE } from './prompt';
import type { DocGroup } from './content';
import { MethodPill } from './method';

/**
 * Домашняя базы знаний.
 *
 * Не простыня промпта на первый экран, а три шага с кодом, как на
 * домашних Vercel и Clerk: токен, первый запрос, выпуск. Промпт для
 * ИИ — одной строкой с кнопкой. Разделы справочника — карточками
 * со счётчиком, а не таблицей с подчёркнутыми ссылками.
 */
export function DocsHome({
  body,
  groups,
  basePath,
}: {
  body: string;
  groups: DocGroup[];
  basePath: string;
}) {
  const [copied, setCopied] = useState(false);
  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(integrationPrompt());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Буфер обмена закрыт настройками браузера — промпт лежит в llms.txt.
    }
  };

  const options = { basePath, slug: 'README' };
  const rest = ['Базовый адрес', 'Формат обмена', 'Что API не делает']
    .map((t) => [t, sectionOf(body, t)] as const)
    .filter(([, text]) => text);

  return (
    <div>
      <h1 className="text-2xl font-medium">API «Вручай»</h1>
      <p className="mt-2 max-w-2xl text-[var(--text-muted)]">{leadOf(body)}</p>

      <ol className="mt-6 grid gap-3 lg:grid-cols-3">
        <Step n="1" title="Токен">
          <p className="text-sm text-[var(--text-muted)]">
            <Link to="/settings/tokens" className="text-[var(--accent)] hover:underline">
              Настройки → Токены API
            </Link>
            . Показывается один раз.
          </p>
          <CodeBlock code={'export VRUCHAY_TOKEN=vru_…'} />
        </Step>
        <Step n="2" title="Первый запрос">
          <p className="text-sm text-[var(--text-muted)]">Проверьте, что токен живой.</p>
          <CodeBlock
            code={`curl -H "Authorization: Bearer $VRUCHAY_TOKEN" \\\n  ${SITE}/api/auth/me`}
          />
        </Step>
        <Step n="3" title="Выпуск">
          <p className="text-sm text-[var(--text-muted)]">
            Документ → получатели → задание → архив. По шагам в{' '}
            <Link to={`${basePath}/AGENTS`} className="text-[var(--accent)] hover:underline">
              AGENTS.md
            </Link>
            .
          </p>
          <CodeBlock code={'POST /api/documents/{id}/generate\nGET  /api/jobs/{jobId}'} />
        </Step>
      </ol>

      <div className="mt-6 flex flex-wrap items-center gap-4 rounded-xl bg-[var(--accent-soft)] p-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-[var(--accent)] text-[var(--accent-contrast)]">
          <Bot size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-medium">Отдайте документацию своему ИИ</p>
          <p className="text-sm text-[var(--text-muted)]">
            Промпт с адресом llms-full.txt и порядком шагов. Вставьте токен и приложите таблицу.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <Button variant="primary" onClick={copyPrompt} icon={copied ? <Check size={15} /> : <Copy size={15} />}>
            {copied ? 'Скопировано' : 'Скопировать промпт'}
          </Button>
          <a
            href={`${SITE}/llms.txt`}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm text-[var(--text-muted)] hover:bg-[var(--surface)] hover:text-[var(--text)]"
          >
            <FileText size={15} />
            llms.txt
          </a>
          <a
            href={`${SITE}/llms-full.txt`}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm text-[var(--text-muted)] hover:bg-[var(--surface)] hover:text-[var(--text)]"
          >
            <FileText size={15} />
            llms-full.txt
          </a>
        </div>
      </div>

      <h2 className="mt-10 mb-3 text-xs font-medium tracking-wide text-[var(--text-muted)] uppercase">
        Справочник
      </h2>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {groups.map((g) => (
          <li key={g.key}>
            <Link
              to={`${basePath}/${g.pages[0].slug}`}
              className="group flex h-full flex-col gap-2 rounded-xl p-4 ring-1 ring-[var(--line)] transition-colors hover:bg-[var(--row-hover)]"
            >
              <span className="flex items-center justify-between gap-2">
                <span className="font-medium">{g.title}</span>
                <span className="tabular text-xs text-[var(--text-muted)]">{g.pages.length}</span>
              </span>
              <span className="flex flex-wrap gap-1">
                {methods(g).map((m) => (
                  <MethodPill key={m} method={m} />
                ))}
              </span>
              <span className="mt-auto flex items-center gap-1 text-sm text-[var(--accent)] opacity-0 transition-opacity group-hover:opacity-100">
                Открыть <ArrowRight size={14} />
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <div className="max-w-2xl">
        {rest.map(([title, text]) => (
          <section key={title}>
            <h2
              id={title}
              className="mt-10 mb-3 text-xs font-medium tracking-wide text-[var(--text-muted)] uppercase"
            >
              {title}
            </h2>
            {renderDoc(text, options)}
          </section>
        ))}
      </div>
    </div>
  );
}

function Step({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <li className="flex min-w-0 flex-col rounded-xl p-4 ring-1 ring-[var(--line)] [&_[data-code]]:my-0 [&_[data-code]]:mt-auto [&_pre]:p-3 [&_pre]:text-xs">
      <span className="text-xs font-medium tracking-wide text-[var(--text-muted)] uppercase">
        {n} · {title}
      </span>
      <div className="mt-1 mb-3 space-y-2">{children}</div>
    </li>
  );
}

/** Какие методы есть в группе — по одному бейджу на метод, без повторов. */
function methods(g: DocGroup): string[] {
  const order = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'];
  const set = new Set(g.pages.map((p) => p.meta.method).filter(Boolean) as string[]);
  return order.filter((m) => set.has(m));
}
