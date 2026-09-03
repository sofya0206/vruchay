/**
 * Содержимое базы знаний.
 *
 * Файлы лежат рядом с приложением (`content/`), а не в `docs/api`, откуда
 * их пишут: папка docs не попадает в образ веба, и импорт «через две
 * директории вверх» собирался бы локально, а в Docker падал. Снимок кладёт
 * скрипт `scripts/sync-api-docs.mjs`, а тест `sync.test.ts` следит, чтобы
 * снимок не разошёлся с источником.
 */

import { INDEX, type DocEntry } from './content/index';

/**
 * Тексты страниц грузятся по одной, а не все разом.
 *
 * Справочник весит под мегабайт. Собранный целиком, он уехал бы в главный
 * кусок сборки — и посетитель посадочной страницы качал бы документацию API,
 * ни разу её не открыв. Оглавление (`index.ts`) маленькое и приезжает сразу,
 * тело нужной страницы — отдельным запросом.
 */
const loaders = import.meta.glob('./content/**/*.md', {
  query: '?raw',
  import: 'default',
}) as Record<string, () => Promise<string>>;

export type DocPage = DocEntry;

export interface DocGroup {
  key: string;
  title: string;
  pages: DocPage[];
}

/** Загружает текст страницы. Возвращает null, если такой страницы нет. */
export async function loadBody(slug: string): Promise<string | null> {
  const load = loaders[`./content/${slug}.md`];
  if (!load) return null;
  return parseFrontMatter(await load()).body;
}

/** Фронтматтер: ключ, двоеточие, значение. Разбор намеренно простой. */
export function parseFrontMatter(text: string): { meta: Record<string, string>; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!match) return { meta: {}, body: text.trim() };

  const meta: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const at = line.indexOf(':');
    if (at === -1) continue;
    meta[line.slice(0, at).trim()] = line.slice(at + 1).trim();
  }
  return { meta, body: text.slice(match[0].length).trim() };
}

export const PAGES: DocPage[] = [...INDEX].sort((a, b) => a.slug.localeCompare(b.slug));

/** Порядок вводных страниц: от «что это» к «что пошло не так». */
const GUIDE_ORDER = ['README', 'authentication', 'rate-limits', 'errors', 'AGENTS'];

/** Названия разделов справочника. Незнакомая группа показывается как есть. */
const GROUP_TITLES: Record<string, string> = {
  auth: 'Проверка доступа',
  awards: 'Правила награждения',
  audit: 'Журнал действий',
  documents: 'Документы и листы',
  generation: 'Выпуск',
  integrations: 'Интеграции',
  mail: 'Почта и домены',
  mailing: 'Рассылка',
  org: 'Организация',
  overview: 'Сводка',
  public: 'Публичные адреса',
  recipients: 'Получатели',
  referral: 'Приглашения',
  registry: 'Реестр',
  reviews: 'Отзывы',
  tokens: 'Токены API',
  validation: 'Проверка данных',
};

function order(slug: string): number {
  const index = GUIDE_ORDER.indexOf(slug);
  return index === -1 ? GUIDE_ORDER.length : index;
}

/** Разделы навигации: сначала введение, затем эндпоинты, затем справочники. */
export function groups(pages: DocPage[] = PAGES): DocGroup[] {
  const guides = pages
    .filter((p) => !p.slug.includes('/'))
    .sort((a, b) => order(a.slug) - order(b.slug) || a.slug.localeCompare(b.slug));

  const reference = pages.filter((p) => p.slug.startsWith('reference/'));

  const byGroup = new Map<string, DocPage[]>();
  for (const page of pages.filter((p) => p.slug.startsWith('endpoints/'))) {
    const key = page.meta.group ?? page.slug.split('/')[1];
    const list = byGroup.get(key) ?? [];
    list.push(page);
    byGroup.set(key, list);
  }

  const out: DocGroup[] = [];
  if (guides.length) out.push({ key: 'guides', title: 'Начало работы', pages: guides });

  for (const [key, list] of [...byGroup].sort(([a], [b]) => a.localeCompare(b))) {
    out.push({ key, title: GROUP_TITLES[key] ?? key, pages: list });
  }

  if (reference.length) out.push({ key: 'reference', title: 'Справочники', pages: reference });
  return out;
}

export function findPage(slug: string, pages: DocPage[] = PAGES): DocPage | undefined {
  return pages.find((p) => p.slug === slug);
}

/** Страница, открытая по умолчанию: обзор, если он есть. */
export const HOME_SLUG = 'README';
