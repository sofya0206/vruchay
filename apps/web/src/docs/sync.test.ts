import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveLink } from './markdown';

/*
 * Снимок документации должен совпадать с источником.
 *
 * Источник правды — docs/api, но собирается сайт из копии в src/docs/content:
 * папка docs в образ веба не попадает. Копия, отставшая от источника, —
 * это опубликованная неправда, которую никто не заметит: страница
 * открывается, выглядит целой и рассказывает про вчерашний API.
 *
 * Обновляется командой: node scripts/sync-api-docs.mjs
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(HERE, '..', '..', '..', '..', 'docs', 'api');
const SNAPSHOT = join(HERE, 'content');

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (name.endsWith('.md')) acc.push(full);
  }
  return acc;
}

const slugs = (dir: string) =>
  walk(dir).map((f) => relative(dir, f).split(sep).join('/').replace(/\.md$/, ''));

// Источник живёт в этом же репозитории. Если его вынесут в отдельный —
// проверять нечего, и падать по этому поводу тест не должен.
const hasSource = existsSync(SOURCE);

describe.skipIf(!hasSource)('снимок документации API', () => {
  it('содержит те же страницы, что и docs/api', () => {
    expect(slugs(SNAPSHOT)).toEqual(slugs(SOURCE));
  });

  it('совпадает с источником побайтно', () => {
    const stale = slugs(SOURCE).filter(
      (slug) =>
        readFileSync(join(SOURCE, `${slug}.md`), 'utf8') !==
        readFileSync(join(SNAPSHOT, `${slug}.md`), 'utf8'),
    );

    expect(stale).toEqual([]);
  });
});

describe('ссылки внутри документации', () => {
  it('ведут на существующие страницы', () => {
    const pages = new Set(slugs(SNAPSHOT));
    const broken: string[] = [];

    for (const slug of pages) {
      const text = readFileSync(join(SNAPSHOT, `${slug}.md`), 'utf8');
      for (const [, href] of text.matchAll(/\]\(([^)\s]+)\)/g)) {
        const target = resolveLink(href, slug, '');
        if (target === null) continue;

        const page = target.replace(/^\//, '');
        if (!pages.has(page)) broken.push(`${slug} → ${href}`);
      }
    }

    expect(broken).toEqual([]);
  });
});
