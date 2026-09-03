/**
 * Переносит документацию API на сайт.
 *
 * Источник правды — docs/api/. Но в образ веба эта папка не попадает:
 * .dockerignore исключает docs целиком, а Dockerfile копирует только
 * apps/web и packages/shared. Страница, импортирующая ../../docs, собиралась
 * бы локально и падала в Docker — то есть ровно там, где проверить некому.
 *
 * Поэтому рядом с приложением живёт снимок: apps/web/src/docs/content/.
 * Он собран этим скриптом и проверяется тестом sync.test.ts — расхождение
 * источника и снимка падает на `pnpm -r test`, а не всплывает на боевом сайте.
 *
 * Заодно отсюда же собираются llms.txt и llms-full.txt: оба должны
 * пересобираться вместе с документацией, иначе машина читает вчерашнее.
 *
 * Запуск: node scripts/sync-api-docs.mjs
 */
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  existsSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(ROOT, 'docs', 'api');
const SNAPSHOT = join(ROOT, 'apps', 'web', 'src', 'docs', 'content');
const PUBLIC = join(ROOT, 'apps', 'web', 'public');
const SITE = 'https://vruchay.ru';
/** Адрес раздела на сайте. Маршрут добавляется в App.tsx отдельно. */
const BASE_PATH = '/docs';

/** Все .md источника, в устойчивом порядке. */
export function collect(dir, acc = []) {
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) collect(full, acc);
    else if (name.endsWith('.md')) acc.push(full);
  }
  return acc;
}

/** Фронтматтер и тело. Разбор намеренно простой: ключ, двоеточие, значение. */
export function parseDoc(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!match) return { meta: {}, body: text.trim() };

  const meta = {};
  for (const line of match[1].split(/\r?\n/)) {
    const at = line.indexOf(':');
    if (at === -1) continue;
    meta[line.slice(0, at).trim()] = line.slice(at + 1).trim();
  }
  return { meta, body: text.slice(match[0].length).trim() };
}

/** Первый заголовок первого уровня — на случай документа без фронтматтера. */
function headingOf(body) {
  return /^#\s+(.+)$/m.exec(body)?.[1]?.trim();
}

/** Первое предложение первого абзаца: подпись к ссылке в llms.txt. */
function summaryOf(body) {
  const lines = body.split('\n');
  const start = lines.findIndex((l) => /^#\s+/.test(l));

  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('#') || line.startsWith('```') || line.startsWith('|')) continue;

    const plain = line.replace(/`/g, '').replace(/\[(.+?)\]\(.+?\)/g, '$1');
    // Одно предложение: подпись должна помещаться в строку списка, а не
    // пересказывать страницу — за пересказом машина сходит по ссылке.
    const sentence = /^(.+?[.!?])(\s|$)/.exec(plain);
    return (sentence ? sentence[1] : plain).replace(/:$/, '');
  }
  return '';
}

/** Порядок вводных страниц: от «что это» к «что пошло не так». */
const GUIDE_ORDER = ['README', 'authentication', 'rate-limits', 'errors', 'AGENTS'];

function guideOrder(slug) {
  const index = GUIDE_ORDER.indexOf(slug);
  return index === -1 ? GUIDE_ORDER.length : index;
}

export function build() {
  const files = collect(SOURCE).map((full) => {
    const slug = relative(SOURCE, full).split(sep).join('/').replace(/\.md$/, '');
    const text = readFileSync(full, 'utf8');
    const { meta, body } = parseDoc(text);
    return {
      slug,
      text,
      meta,
      body,
      title: meta.title ?? headingOf(body) ?? slug,
      summary: summaryOf(body),
    };
  });

  // Снимок пересобирается целиком: иначе удалённая в источнике страница
  // осталась бы на сайте навсегда.
  rmSync(SNAPSHOT, { recursive: true, force: true });
  for (const file of files) {
    const target = join(SNAPSHOT, `${file.slug}.md`);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, file.text);
  }

  // Оглавление отдельным модулем: страница показывает навигацию сразу,
  // а тексты подтягивает по одному. Иначе весь справочник (сотни килобайт)
  // уезжал бы в главный кусок сборки и грузился бы на посадочной странице,
  // где он никому не нужен.
  writeFileSync(join(SNAPSHOT, 'index.ts'), indexModule(files));

  writeFileSync(join(PUBLIC, 'llms.txt'), llmsTxt(files));
  writeFileSync(join(PUBLIC, 'llms-full.txt'), llmsFullTxt(files));
  return files;
}

/** Оглавление для навигации: всё, кроме текстов страниц. */
function indexModule(files) {
  const rows = files.map((file) =>
    [
      '  {',
      `    slug: ${JSON.stringify(file.slug)},`,
      `    title: ${JSON.stringify(file.title)},`,
      `    meta: ${JSON.stringify(file.meta)},`,
      '  },',
    ].join('\n'),
  );

  return [
    '// Собрано scripts/sync-api-docs.mjs из docs/api. Руками не править.',
    '',
    'export interface DocEntry {',
    '  slug: string;',
    '  title: string;',
    '  meta: Record<string, string>;',
    '}',
    '',
    'export const INDEX: DocEntry[] = [',
    ...rows,
    '];',
    '',
  ].join('\n');
}

/** Карта документации по соглашению llmstxt.org: заголовок, суть, ссылки. */
function llmsTxt(files) {
  const guides = files
    .filter((f) => !f.slug.includes('/'))
    .sort((a, b) => guideOrder(a.slug) - guideOrder(b.slug) || a.slug.localeCompare(b.slug));
  const reference = files.filter((f) => f.slug.startsWith('reference/'));
  const endpoints = files.filter((f) => f.slug.startsWith('endpoints/'));

  const groups = new Map();
  for (const file of endpoints) {
    const group = file.meta.group ?? file.slug.split('/')[1];
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(file);
  }

  const out = [
    '# Вручай — API массового выпуска именных документов',
    '',
    '> Сервис принимает таблицу участников и макет листа, а возвращает готовые',
    '> документы: по одному PDF или JPEG на человека, с подстановкой имени,',
    '> склонением по падежам, номером и ссылкой на проверку подлинности.',
    '> Всё, что делает кабинет, доступно по токену API — кроме управления людьми.',
    '',
    `Базовый адрес API: ${SITE}/api. Аутентификация: заголовок Authorization: Bearer vru_… .`,
    'Полная выжимка одним файлом: ' + `${SITE}/llms-full.txt`,
    '',
    '## Начало работы',
    '',
  ];

  for (const file of guides) {
    out.push(
      `- [${file.title}](${SITE}${BASE_PATH}/${file.slug})${file.summary ? `: ${file.summary}` : ''}`,
    );
  }

  for (const [group, list] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
    out.push('', `## Эндпоинты: ${group}`, '');
    for (const file of list) {
      const route =
        file.meta.method && file.meta.path ? `${file.meta.method} ${file.meta.path} — ` : '';
      out.push(
        `- [${route}${file.title}](${SITE}${BASE_PATH}/${file.slug})${file.summary ? `: ${file.summary}` : ''}`,
      );
    }
  }

  if (reference.length) {
    out.push('', '## Справочники', '');
    for (const file of reference) {
      out.push(
        `- [${file.title}](${SITE}${BASE_PATH}/${file.slug})${file.summary ? `: ${file.summary}` : ''}`,
      );
    }
  }

  out.push('');
  return out.join('\n');
}

/** Вся документация одним файлом — чтобы модели хватило одного запроса. */
function llmsFullTxt(all) {
  const files = [
    ...all
      .filter((f) => !f.slug.includes('/'))
      .sort((a, b) => guideOrder(a.slug) - guideOrder(b.slug)),
    ...all.filter((f) => f.slug.startsWith('endpoints/')),
    ...all.filter((f) => f.slug.startsWith('reference/')),
  ];

  const out = [
    '# Вручай — полная документация API',
    '',
    `Собрано автоматически из docs/api. Базовый адрес: ${SITE}/api.`,
    'Аутентификация: заголовок Authorization: Bearer vru_… (токен выдаётся в кабинете).',
    '',
    '---',
    '',
  ];

  for (const file of files) {
    const facts = ['method', 'path', 'auth', 'roles', 'rate_limit']
      .filter((key) => file.meta[key])
      .map((key) => `${key}: ${file.meta[key]}`);

    out.push(`<!-- ${file.slug} -->`);
    if (facts.length) out.push(`> ${facts.join(' | ')}`, '');
    out.push(file.body, '', '---', '');
  }

  return out.join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!existsSync(SOURCE)) {
    console.error(`Нет папки ${SOURCE}: нечего переносить.`);
    process.exit(1);
  }
  const files = build();
  console.log(`Перенесено страниц: ${files.length}`);
  console.log(`Снимок: ${relative(ROOT, SNAPSHOT)}`);
  console.log(`Карта: apps/web/public/llms.txt, выжимка: apps/web/public/llms-full.txt`);
}
