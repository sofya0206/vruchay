import { Link } from 'react-router-dom';
import { useState, type ReactNode } from 'react';
import { Check, Copy } from 'lucide-react';
import { headingId } from './panel';

/**
 * Разметка страниц базы знаний.
 *
 * Своя, а не библиотека, по той же причине, что и в юридических текстах:
 * результат собирается элементами React, а не вставкой строки в HTML.
 * Документация приходит из репозитория, но правило одно для всех — разметка,
 * собранная из текста, в приложение не вставляется никогда.
 *
 * Отличие от `legal/markdown`: здесь нужны блоки кода и код внутри строки —
 * без них справочник по API читать нечем, — а ссылки между страницами
 * документации ведут внутрь приложения, а не наружу.
 */

interface Options {
  /** Адрес раздела, например `/docs`. */
  basePath: string;
  /** Адрес текущей страницы внутри раздела: нужен для относительных ссылок. */
  slug: string;
}

/** Приводит ссылку из файла документации к адресу страницы приложения. */
export function resolveLink(href: string, slug: string, basePath: string): string | null {
  if (/^(https?:|mailto:|#)/.test(href)) return null;

  const from = slug.split('/').slice(0, -1);
  const parts = href.replace(/\.md$/, '').replace(/\/$/, '').split('/');

  for (const part of parts) {
    if (part === '.' || part === '') continue;
    if (part === '..') from.pop();
    else from.push(part);
  }

  const target = from.join('/');
  return target ? `${basePath}/${target}` : basePath;
}

/** Жирный шрифт, код внутри строки и ссылки. */
function inline(text: string, key: string, options: Options): ReactNode[] {
  const parts: ReactNode[] = [];
  const pattern = /`([^`]+)`|\*\*(.+?)\*\*|\[(.+?)\]\(([^\s)]+)\)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));

    if (match[1] !== undefined) {
      parts.push(
        <code
          key={`${key}-c${i}`}
          className="rounded bg-sunken px-1.5 py-0.5 font-mono text-[0.85em] text-ink"
        >
          {match[1]}
        </code>,
      );
    } else if (match[2] !== undefined) {
      parts.push(<strong key={`${key}-b${i}`}>{match[2]}</strong>);
    } else {
      const label = match[3];
      const href = match[4];
      const internal = resolveLink(href, options.slug, options.basePath);
      const className = 'text-accent underline underline-offset-2';

      parts.push(
        internal ? (
          <Link key={`${key}-a${i}`} to={internal} className={className}>
            {label}
          </Link>
        ) : (
          <a key={`${key}-a${i}`} href={href} className={className} rel="noopener noreferrer">
            {label}
          </a>
        ),
      );
    }

    last = match.index + match[0].length;
    i++;
  }

  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

/** Ячейки строки таблицы: по краям после разбиения остаются пустые. */
function cells(row: string): string[] {
  const parts = row.split('|').map((c) => c.trim());
  if (parts[0] === '') parts.shift();
  if (parts[parts.length - 1] === '') parts.pop();
  return parts;
}

export function renderDoc(source: string, options: Options): ReactNode[] {
  const out: ReactNode[] = [];
  const lines = source.split('\n');
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i++;
      continue;
    }

    // Блок кода: до закрывающих кавычек. Содержимое не разбирается —
    // в примерах запросов встречается всё что угодно, включая обратные кавычки.
    const fence = /^```(\w*)/.exec(line);
    if (fence) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) {
        code.push(lines[i]);
        i++;
      }
      i++; // закрывающая строка
      out.push(<CodeBlock key={key++} lang={fence[1]} code={code.join('\n')} />);
      continue;
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const text = heading[2];
      const cls =
        level === 1
          ? 'mt-2 mb-4 text-2xl font-medium'
          : level === 2
            ? 'mt-10 mb-3 scroll-mt-28 text-xs font-medium tracking-wide text-muted uppercase'
            : 'mt-6 mb-2 font-medium';
      const Tag = (level === 1 ? 'h1' : level === 2 ? 'h2' : 'h3') as 'h1' | 'h2' | 'h3';
      out.push(
        <Tag key={key++} id={level === 2 ? headingId(text) : undefined} className={cls}>
          {inline(text, `h${key}`, options)}
        </Tag>,
      );
      i++;
      continue;
    }

    if (line.startsWith('>')) {
      const quote: string[] = [];
      while (i < lines.length && lines[i].startsWith('>')) {
        quote.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      out.push(
        <blockquote
          key={key++}
          className="my-4 border-l-2 border-accent pl-4 text-muted"
        >
          {inline(quote.join(' '), `q${key}`, options)}
        </blockquote>,
      );
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*]\s+/, ''));
        i++;
      }
      out.push(
        <ul key={key++} className="my-3 list-disc space-y-1.5 pl-5 marker:text-muted">
          {items.map((item, n) => (
            <li key={n}>{inline(item, `l${key}-${n}`, options)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s+/, ''));
        i++;
      }
      out.push(
        <ol key={key++} className="my-3 list-decimal space-y-1.5 pl-5 marker:text-muted">
          {items.map((item, n) => (
            <li key={n}>{inline(item, `o${key}-${n}`, options)}</li>
          ))}
        </ol>,
      );
      continue;
    }

    // Таблица: строка заголовка, строка-разделитель, дальше данные.
    if (line.includes('|') && lines[i + 1]?.includes('---')) {
      const head = cells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes('|')) {
        rows.push(cells(lines[i]));
        i++;
      }
      out.push(
        <div key={key++} className="my-4 overflow-x-auto">
          <table className="w-full text-left text-sm [&_code]:text-[0.8rem]">
            <thead className="text-[11px] tracking-wide text-muted uppercase">
              <tr>
                {head.map((h, n) => (
                  <th key={n} className="pb-2 pr-4 font-medium">
                    {inline(h, `th${n}`, options)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, n) => (
                <tr key={n} className="border-t border-line">
                  {row.map((c, m) => (
                    <td key={m} className="py-2 pr-4 align-top">
                      {inline(c, `td${n}-${m}`, options)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    const paragraph: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,4}\s|[-*]\s|\d+\.\s|>|```)/.test(lines[i]) &&
      !(lines[i].includes('|') && lines[i + 1]?.includes('---'))
    ) {
      paragraph.push(lines[i].trim());
      i++;
    }

    // Строка, не подошедшая ни под одно правило и не давшая абзаца:
    // без этого шага цикл встал бы на месте.
    if (paragraph.length === 0) {
      i++;
      continue;
    }

    out.push(
      <p key={key++} className="my-3 leading-relaxed">
        {inline(paragraph.join(' '), `p${key}`, options)}
      </p>,
    );
  }

  return out;
}

/**
 * Блок кода с кнопкой копирования и подписью языка.
 *
 * Тёмный на любой теме: код — это терминал, а не текст страницы,
 * и так его читают в Stripe и Mintlify.
 */
export function CodeBlock({ lang, code, label }: { lang?: string; code: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Буфер закрыт настройками браузера — текст можно выделить руками.
    }
  };
  return (
    <div data-code className="my-4 overflow-hidden rounded-card bg-code-bg text-code-fg ring-1 ring-code-line">
      {(label || lang) && (
        <div className="flex items-center gap-2 border-b border-code-line px-3 py-1.5 text-xs text-code-muted">
          <span className="font-medium text-code-fg">{label}</span>
          <span className="ml-auto font-mono">{lang}</span>
          <CopyBtn copied={copied} onClick={copy} />
        </div>
      )}
      <div className="relative">
        {!(label || lang) && (
          <div className="absolute top-2 right-2">
            <CopyBtn copied={copied} onClick={copy} />
          </div>
        )}
        <pre className="overflow-x-auto p-4 text-[0.8125rem] leading-relaxed">
          <code className="font-mono">{code}</code>
        </pre>
      </div>
    </div>
  );
}

function CopyBtn({ copied, onClick }: { copied: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={copied ? 'Скопировано' : 'Скопировать'}
      // Под палец не растёт: без заголовка кнопка лежит поверх самого
      // кода, и крупная накрывала бы первую строку, а у короткого
      // примера ещё и вылезала за скруглённый угол рамки.
      className="grid size-7 place-items-center rounded-md text-code-muted transition-colors hover:bg-code-line hover:text-code-fg"
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
    </button>
  );
}
