/**
 * Разбор страницы на текст и панель кода.
 *
 * Файлы справочника написаны одной колонкой: описание, таблицы, пример
 * запроса, пример ответа. На широком экране пример и ответ уезжают
 * в панель справа — так устроены Stripe и Mintlify, и запрос виден
 * рядом с описанием параметров, а не после трёх экранов таблиц.
 * Источник при этом не меняется: разбираем то, что уже есть.
 */

export interface CodeSample {
  label: string;
  lang: string;
  code: string;
}

export interface SplitDoc {
  /** Текст без заголовка первого уровня и без блоков, ушедших в панель. */
  body: string;
  request: CodeSample | null;
  responses: CodeSample[];
  /** Заголовки второго уровня — оглавление страницы. */
  toc: { id: string; title: string }[];
}

/** Якорь заголовка: латиница и кириллица, дефисы вместо остального. */
export function headingId(text: string): string {
  return text
    .toLowerCase()
    .replace(/`/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-|-$/g, '');
}

interface Section {
  title: string | null;
  lines: string[];
}

function sections(lines: string[]): Section[] {
  const out: Section[] = [{ title: null, lines: [] }];
  let inFence = false;
  for (const line of lines) {
    if (/^```/.test(line)) inFence = !inFence;
    const h = !inFence && /^##\s+(.*)$/.exec(line);
    if (h) out.push({ title: h[1].trim(), lines: [line] });
    else out[out.length - 1].lines.push(line);
  }
  return out;
}

/** Вынимает блоки кода из секции; возвращает остаток и блоки. */
function takeFences(lines: string[]): { rest: string[]; fences: { lang: string; code: string; before: string[] }[] } {
  const rest: string[] = [];
  const fences: { lang: string; code: string; before: string[] }[] = [];
  let i = 0;
  let since: string[] = [];
  while (i < lines.length) {
    const fence = /^```(\w*)/.exec(lines[i]);
    if (!fence) {
      rest.push(lines[i]);
      since.push(lines[i]);
      i++;
      continue;
    }
    const code: string[] = [];
    i++;
    while (i < lines.length && !/^```/.test(lines[i])) code.push(lines[i++]);
    i++;
    fences.push({ lang: fence[1], code: code.join('\n'), before: since });
    since = [];
  }
  return { rest, fences };
}

/** Код ответа из строки вроде «`200 OK`» перед блоком; иначе — «Ответ». */
function statusLabel(before: string[], fallback: string): string {
  for (let i = before.length - 1; i >= 0; i--) {
    const m = /`(\d{3})[^`]*`/.exec(before[i]);
    if (m) return m[1];
  }
  return fallback;
}

/** Страница эндпоинта: пример и ответы в панель. Вводная страница: только оглавление. */
export function splitDoc(source: string, endpoint: boolean): SplitDoc {
  const lines = source.split('\n');
  const toc: { id: string; title: string }[] = [];
  let request: CodeSample | null = null;
  const responses: CodeSample[] = [];
  const kept: string[] = [];

  for (const section of sections(lines)) {
    if (section.title === null) {
      // Заголовок первого уровня рисует страница сама — словами, а не путём.
      kept.push(...section.lines.filter((l) => !/^#\s/.test(l)));
      continue;
    }
    if (!endpoint) {
      toc.push({ id: headingId(section.title), title: section.title.replace(/`/g, '') });
      kept.push(...section.lines);
      continue;
    }
    if (/^пример/i.test(section.title)) {
      const { fences } = takeFences(section.lines.slice(1));
      if (fences[0]) request = { label: 'Запрос', lang: fences[0].lang || 'bash', code: fences[0].code };
      continue;
    }
    if (/^ответ/i.test(section.title)) {
      const { rest, fences } = takeFences(section.lines.slice(1));
      for (const f of fences) {
        responses.push({ label: statusLabel(f.before, 'Ответ'), lang: f.lang || 'json', code: f.code });
      }
      const body = rest.join('\n').trim();
      if (body) {
        toc.push({ id: headingId(section.title), title: section.title });
        kept.push(section.lines[0], ...rest);
      }
      continue;
    }
    toc.push({ id: headingId(section.title), title: section.title.replace(/`/g, '') });
    kept.push(...section.lines);
  }

  return { body: kept.join('\n').trim(), request, responses, toc };
}

/** Секция файла по заголовку — для домашней, собранной из README. */
export function sectionOf(source: string, title: string): string {
  const s = sections(source.split('\n')).find((x) => x.title?.toLowerCase() === title.toLowerCase());
  return s ? s.lines.slice(1).join('\n').trim() : '';
}

/** Первый абзац файла — подводка домашней. */
export function leadOf(source: string): string {
  const lines = source.split('\n');
  const out: string[] = [];
  for (const line of lines) {
    if (/^#\s/.test(line)) continue;
    if (!line.trim()) {
      if (out.length) break;
      continue;
    }
    out.push(line.trim());
  }
  return out.join(' ');
}
