#!/usr/bin/env node
/*
 * Скачивает шрифты редактора в репозиторий: apps/web/public/fonts/*.woff2
 * и apps/web/src/fonts.css с правилами @font-face.
 *
 *   node scripts/fetch-fonts.mjs
 *
 * Запускается руками и редко — когда меняется список шрифтов. Файлы
 * коммитятся. Ни сборка, ни работающий сервис в интернет за шрифтами не ходят,
 * и это принципиально: страницу печати открывает Chromium внутри контейнера,
 * и если бы шрифт грузился из сети, то сбой у стороннего сервиса печатал бы
 * грамоты чужим шрифтом — молча, без единой ошибки в журнале.
 *
 * Все восемь семейств распространяются по SIL Open Font License 1.1,
 * которая разрешает встраивание и распространение в составе продукта.
 * Условие лицензии — сохранять её текст: он кладётся рядом, в OFL.txt.
 *
 * Берём только кириллицу и латиницу: греческий и вьетнамский в наградных
 * документах не нужны, а вес страницы печати они увеличивают заметно.
 */
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'apps/web/public/fonts');
const CSS_PATH = join(ROOT, 'apps/web/src/fonts.css');

/** Подмножества, которые оставляем. Остальные отбрасываем. */
const KEEP_SUBSETS = new Set(['cyrillic', 'cyrillic-ext', 'latin', 'latin-ext']);

/*
 * Начертания запрашиваем ровно те, что умеет редактор: обычное, полужирное
 * и их курсивы (в схеме листа есть bold и italic). У рукописных курсива нет —
 * для них запрашиваем только то, что существует, иначе Google Fonts отвечает
 * 400 на весь запрос и семейство пропадает целиком.
 *
 * Jost стоит особняком: это шрифт интерфейса, а не макета. Ему нужны
 * промежуточные насыщенности (500 и 600 — ими набраны кнопки, подписи
 * и заголовки), и показывать его нужно с подменой, а не с ожиданием, —
 * см. `display` ниже.
 */
const FAMILIES = [
  { name: 'PT Sans', query: 'ital,wght@0,400;0,700;1,400;1,700' },
  { name: 'PT Serif', query: 'ital,wght@0,400;0,700;1,400;1,700' },
  { name: 'Inter', query: 'ital,wght@0,400;0,700;1,400;1,700' },
  { name: 'Montserrat', query: 'ital,wght@0,400;0,700;1,400;1,700' },
  { name: 'Lora', query: 'ital,wght@0,400;0,700;1,400;1,700' },
  { name: 'Playfair Display', query: 'ital,wght@0,400;0,700;1,400;1,700' },
  { name: 'Caveat', query: 'wght@400;700' },
  { name: 'Marck Script', query: '' },
  {
    name: 'Jost',
    query: 'ital,wght@0,400;0,500;0,600;0,700;1,400',
    display: 'swap',
    standalone: true,
  },
];

/*
 * Отдельный файл с правилами для интерфейсного шрифта — для страниц, которые
 * сервер отдаёт своей разметкой, минуя сборку кабинета: отписка от рассылки,
 * подтверждение заявки с чужого сайта. Лежит в корне public, а не в /fonts:
 * Caddy держит /fonts вечно и с пометкой immutable, что верно для файлов
 * с хешем в имени, но не для этого — его имя постоянно, а содержимое меняется
 * вместе со списком начертаний.
 */
const STANDALONE_CSS_PATH = join(ROOT, 'apps/web/public/interface-font.css');

/*
 * Google Fonts отдаёт woff2 только современным браузерам — по User-Agent.
 * Без этого заголовка приходит ttf, который вчетверо тяжелее.
 */
const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function get(url, asBuffer = false) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url}`);
  return asBuffer ? Buffer.from(await res.arrayBuffer()) : res.text();
}

/** Разбирает ответ css2 на блоки @font-face с пометкой подмножества. */
function parseFaces(css) {
  const faces = [];
  // Комментарий с названием подмножества идёт перед своим блоком.
  const re = /\/\*\s*([a-z-]+)\s*\*\/\s*@font-face\s*\{([^}]+)\}/g;
  let m;
  while ((m = re.exec(css))) {
    const [, subset, body] = m;
    const field = (n) => body.match(new RegExp(`${n}:\\s*([^;]+);`))?.[1]?.trim();
    const url = body.match(/url\((https:[^)]+\.woff2)\)/)?.[1];
    if (!url) continue;
    faces.push({
      subset,
      url,
      family: field('font-family')?.replace(/^['"]|['"]$/g, ''),
      style: field('font-style') ?? 'normal',
      weight: field('font-weight') ?? '400',
      unicodeRange: field('unicode-range'),
    });
  }
  return faces;
}

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Каталог пересоздаём: иначе файлы, оставшиеся от прежнего списка семейств,
// продолжали бы лежать в сборке, не упомянутые ни одним правилом.
await rm(OUT_DIR, { recursive: true, force: true });
await mkdir(OUT_DIR, { recursive: true });

const blocks = [];
// Те же правила, что и в общем файле, но только для семейств с пометкой
// standalone: их подключают страницы вне сборки кабинета.
const standaloneBlocks = [];
let files = 0;
let bytes = 0;

for (const family of FAMILIES) {
  const display = family.display ?? 'block';
  const spec = family.query ? `${family.name.replace(/ /g, '+')}:${family.query}` : family.name.replace(/ /g, '+');
  const css = await get(`https://fonts.googleapis.com/css2?family=${spec}&display=${display}`);
  const faces = parseFaces(css).filter((f) => KEEP_SUBSETS.has(f.subset));

  if (!faces.length) throw new Error(`Для «${family.name}» не нашлось ни одного подходящего начертания`);

  for (const f of faces) {
    const data = await get(f.url, true);
    /*
     * В имя файла добавляем хеш содержимого. Vite такие имена раздаёт сам,
     * но public/ он копирует как есть, а Caddy отдаёт шрифты с годичным
     * сроком хранения и пометкой immutable. Без хеша обновлённый шрифт
     * под прежним именем год не доходил бы до тех, кто уже заходил.
     */
    const hash = createHash('sha256').update(data).digest('hex').slice(0, 8);
    const name = `${slug(family.name)}-${f.weight.replace(/\s+/g, '')}-${f.style}-${f.subset}.${hash}.woff2`;
    await writeFile(join(OUT_DIR, name), data);
    files += 1;
    bytes += data.length;

    const block = [
      '@font-face {',
      `  font-family: '${family.name}';`,
      `  font-style: ${f.style};`,
      `  font-weight: ${f.weight};`,
      /*
       * У шрифтов макета block, а не swap: при печати подмена шрифта — это
       * брак в готовом документе, который никто уже не заметит. Пусть Chromium
       * лучше подождёт шрифт, чем напечатает не тем. У интерфейсного шрифта
       * наоборот: печатать нечего, а невидимый текст в кабинете — это пустой
       * экран на медленной связи.
       */
      `  font-display: ${display};`,
      `  src: url('/fonts/${name}') format('woff2');`,
      f.unicodeRange ? `  unicode-range: ${f.unicodeRange};` : null,
      '}',
    ]
      .filter(Boolean)
      .join('\n');

    blocks.push(block);
    if (family.standalone) standaloneBlocks.push(block);
  }
  console.log(`  ✓ ${family.name} — ${faces.length} начертаний`);
}

const header = `/*
 * Шрифты интерфейса, редактора и печати. Файл создан scripts/fetch-fonts.mjs —
 * правки руками потеряются при следующем запуске, меняйте список в скрипте.
 *
 * Подключён из index.css, поэтому действует и в редакторе, и в предпросмотре,
 * и на странице /render, которую открывает Chromium при печати. Одни и те же
 * правила для всех трёх — иначе PDF отличался бы от того, что видел человек.
 *
 * Jost здесь — единственный интерфейсный: им набран весь кабинет и посадочная
 * страница (см. --font-sans в index.css). Остальные семейства выбирает человек
 * для самого наградного листа.
 *
 * Все семейства — SIL Open Font License 1.1, текст лицензии в OFL.txt.
 */
`;

await writeFile(CSS_PATH, `${header}\n${blocks.join('\n\n')}\n`);

const standaloneHeader = `/*
 * Интерфейсный шрифт для страниц вне сборки кабинета — их сервер отдаёт
 * своей разметкой (отписка от рассылки, подтверждение заявки с чужого сайта).
 * Файл создан scripts/fetch-fonts.mjs, правки руками потеряются.
 *
 * Имя постоянное, без хеша, — поэтому файл лежит в корне public, а не
 * в /fonts: там Caddy держит содержимое год и с пометкой immutable.
 */
`;

await writeFile(STANDALONE_CSS_PATH, `${standaloneHeader}\n${standaloneBlocks.join('\n\n')}\n`);

const license = await get('https://raw.githubusercontent.com/google/fonts/main/ofl/ptsans/OFL.txt').catch(
  () => null,
);
if (license) await writeFile(join(OUT_DIR, 'OFL.txt'), license);

console.log(`\n✓ ${files} файлов, ${(bytes / 1024 / 1024).toFixed(1)} МБ → apps/web/public/fonts/`);
console.log(`✓ правила → apps/web/src/fonts.css`);
console.log(`✓ правила интерфейсного шрифта → apps/web/public/interface-font.css`);
if (!license) console.log('⚠ текст лицензии скачать не удалось — положите OFL.txt рядом вручную');
