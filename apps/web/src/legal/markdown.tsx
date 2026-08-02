import type { ReactNode } from 'react';

/**
 * Разметка юридических текстов.
 *
 * Своя, а не библиотека: разбирать нужно ровно те приёмы, что встречаются
 * в наших документах — заголовки, абзацы, списки, таблицы, жирный шрифт
 * и ссылки. Библиотека потянула бы за собой сотню килобайт и умение
 * выполнять произвольный HTML, а он в этих текстах не нужен и опасен.
 *
 * Результат собирается элементами React, а не вставкой разметки строкой:
 * даже для собственного текста это исключает целый класс ошибок.
 */

/** Жирный шрифт и ссылки внутри строки. */
function inline(text: string, key: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const pattern = /\*\*(.+?)\*\*|\[(.+?)\]\((https?:\/\/[^\s)]+)\)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    if (match[1] !== undefined) {
      parts.push(<strong key={`${key}-b${i}`}>{match[1]}</strong>);
    } else {
      parts.push(
        <a
          key={`${key}-a${i}`}
          href={match[3]}
          className="text-[var(--accent)] underline underline-offset-2"
          rel="noopener noreferrer"
        >
          {match[2]}
        </a>,
      );
    }
    last = match.index + match[0].length;
    i++;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export function renderMarkdown(source: string): ReactNode[] {
  const out: ReactNode[] = [];
  const lines = source.split('\n');
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Внутренние заметки для нас — цитатами в начале файла. Наружу не идут.
    if (line.startsWith('>')) {
      i++;
      continue;
    }

    if (!line.trim()) {
      i++;
      continue;
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const text = heading[2];
      const cls =
        level === 1
          ? 'mt-8 mb-3 font-serif text-2xl'
          : level === 2
            ? 'mt-8 mb-2 font-serif text-lg'
            : 'mt-5 mb-2 font-medium';
      const Tag = (level === 1 ? 'h1' : level === 2 ? 'h2' : 'h3') as 'h1' | 'h2' | 'h3';
      out.push(
        <Tag key={key++} className={cls}>
          {inline(text, `h${key}`)}
        </Tag>,
      );
      i++;
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*]\s+/, ''));
        i++;
      }
      out.push(
        <ul key={key++} className="my-3 list-disc space-y-1 pl-6">
          {items.map((item, n) => (
            <li key={n}>{inline(item, `l${key}-${n}`)}</li>
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
        <ol key={key++} className="my-3 list-decimal space-y-1 pl-6">
          {items.map((item, n) => (
            <li key={n}>{inline(item, `o${key}-${n}`)}</li>
          ))}
        </ol>,
      );
      continue;
    }

    // Таблица: строка заголовка, строка-разделитель, дальше данные.
    if (line.includes('|') && lines[i + 1]?.includes('---')) {
      const cells = (row: string) =>
        row
          .split('|')
          .map((c) => c.trim())
          .filter((_, n, all) => n !== 0 || all.length === 1 ? true : true)
          .filter((c, n, all) => !(c === '' && (n === 0 || n === all.length - 1)));
      const head = cells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes('|')) {
        rows.push(cells(lines[i]));
        i++;
      }
      out.push(
        <div key={key++} className="my-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-[var(--text-muted)] uppercase">
              <tr>
                {head.map((h, n) => (
                  <th key={n} className="py-1.5 pr-4 font-medium">
                    {inline(h, `th${n}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, n) => (
                <tr key={n} className="border-t border-[var(--line)]">
                  {row.map((c, m) => (
                    <td key={m} className="py-1.5 pr-4 align-top">
                      {inline(c, `td${n}-${m}`)}
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

    // Абзац: подряд идущие непустые строки склеиваются.
    const paragraph: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|[-*]\s|\d+\.\s|>)/.test(lines[i])) {
      paragraph.push(lines[i].trim());
      i++;
    }
    out.push(
      <p key={key++} className="my-3 leading-relaxed">
        {inline(paragraph.join(' '), `p${key}`)}
      </p>,
    );
  }

  return out;
}
