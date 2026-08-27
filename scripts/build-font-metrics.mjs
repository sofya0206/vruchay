#!/usr/bin/env node
/*
 * Собирает метрики шрифтов из apps/web/public/fonts/*.woff2
 * в packages/shared/src/fonts/metrics.json.
 *
 *   node scripts/build-font-metrics.mjs
 *
 * Запускается руками и редко — после scripts/fetch-fonts.mjs, когда сменился
 * список шрифтов. Результат коммитится: ни сборка, ни работающий сервис
 * шрифты не разбирают.
 *
 * Зачем это нужно. Проверка списка перед выпуском обязана ответить, влезет ли
 * фамилия в блок, — а единственный шрифтовой движок в проекте это Chromium,
 * который печатает готовый лист. Гонять его по строке на список в десять тысяч
 * человек нельзя: это часы. Поэтому ширины букв снимаем заранее и один раз,
 * а дальше считаем арифметикой.
 *
 * Ширины снимает сам Chromium, а не наш разбор шрифта, и это важно.
 * Шесть семейств из восьми — переменные шрифты: в их таблице hmtx лежит
 * начертание по умолчанию, то есть обычное, а полужирное получается из него
 * поправками из HVAR. Разбор hmtx поэтому молча выдаёт обычные ширины
 * за полужирные — на «Сертификат участника» в Montserrat это ошибка
 * в шесть процентов в сторону «влезет», то есть ровно в ту сторону,
 * в какую ошибаться нельзя. Chromium же считает так, как потом и напечатает.
 *
 * Разбираем шрифт мы всё-таки сами, но только ради списка символов:
 * какие буквы в начертании есть, а каких нет.
 *
 * Отдельная беда — кернинг и вязь. Ширина строки не равна сумме ширин её
 * букв: кернинг сдвигает пары вроде «AV», а рукописные шрифты подменяют
 * буквы связными вариантами, и «Сертификат участника» в Caveat оказывается
 * на три с половиной процента шире суммы. В посимвольную таблицу это
 * не укладывается никак, а ошибка выходит в опасную сторону — «влезет»
 * там, где не влезет.
 *
 * Поэтому рядом с ширинами снимаем поправку на вязь: для каждого начертания
 * браузер меряет два десятка настоящих строк, и мы запоминаем, во сколько
 * раз настоящая ширина отличается от суммы букв. Поправка своя у каждого
 * начертания: у рукописных она заметная, у наборных около единицы.
 * Остаток расхождения закреплён тестом
 * apps/server/src/validation/measure-vs-chromium.test.ts.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { brotliDecompressSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FONTS_DIR = join(ROOT, 'apps/web/public/fonts');
const OUT_PATH = join(ROOT, 'packages/shared/src/fonts/metrics.json');

/**
 * Единица измерения таблицы: ширины храним в тысячных долях em.
 * Округление до целой тысячной даёт по букве не больше 0,05% ошибки,
 * а на фоне кернинга это ничто.
 */
const UNITS_PER_EM = 1000;

/** Имена таблиц по номеру из спецификации WOFF2: в файле лежит номер, а не имя. */
const KNOWN_TAGS = [
  'cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm',
  'glyf', 'loca', 'prep', 'CFF ', 'VORG', 'EBDT', 'EBLC', 'gasp', 'hdmx', 'kern',
  'LTSH', 'PCLT', 'VDMX', 'vhea', 'vmtx', 'BASE', 'GDEF', 'GPOS', 'GSUB', 'EBSC',
  'JSTF', 'MATH', 'CBDT', 'CBLC', 'COLR', 'CPAL', 'SVG ', 'sbix', 'acnt', 'avar',
  'bdat', 'bloc', 'bsln', 'cvar', 'fdsc', 'feat', 'fmtx', 'fvar', 'gvar', 'hsty',
  'just', 'lcar', 'mort', 'morx', 'opbd', 'prop', 'trak', 'Zapf', 'Silf', 'Glat',
  'Gloc', 'Feat', 'Sill',
];

/** Целое переменной длины: семь бит на байт, старший бит — признак продолжения. */
function readBase128(buf, cursor) {
  let value = 0;
  for (let i = 0; i < 5; i++) {
    const byte = buf[cursor.offset++];
    value = value * 128 + (byte & 0x7f);
    if ((byte & 0x80) === 0) return value;
  }
  throw new Error('Испорченное число переменной длины в таблице WOFF2');
}

/** Распаковывает WOFF2 и раскладывает его на таблицы шрифта. */
function readWoff2Tables(buf) {
  if (buf.toString('latin1', 0, 4) !== 'wOF2') throw new Error('Это не WOFF2');

  const numTables = buf.readUInt16BE(12);
  const totalCompressedSize = buf.readUInt32BE(20);

  const cursor = { offset: 48 };
  const directory = [];
  for (let i = 0; i < numTables; i++) {
    const flags = buf[cursor.offset++];
    const index = flags & 0x3f;

    let tag;
    if (index === 63) {
      tag = buf.toString('latin1', cursor.offset, cursor.offset + 4);
      cursor.offset += 4;
    } else {
      tag = KNOWN_TAGS[index];
    }

    // Признак перекодировки читается наоборот для glyf и loca: у них
    // «нулевая версия» означает как раз перекодированную таблицу.
    const version = (flags >> 6) & 0x03;
    const transformed = tag === 'glyf' || tag === 'loca' ? version !== 3 : version !== 0;

    const originalLength = readBase128(buf, cursor);
    const transformLength = transformed ? readBase128(buf, cursor) : null;

    directory.push({ tag, length: transformLength ?? originalLength });
  }

  const data = brotliDecompressSync(
    buf.subarray(cursor.offset, cursor.offset + totalCompressedSize),
  );

  const tables = {};
  let offset = 0;
  for (const entry of directory) {
    tables[entry.tag] = data.subarray(offset, offset + entry.length);
    offset += entry.length;
  }
  return tables;
}

/** Какие символы есть в начертании. Форматы 4 и 12 покрывают всё, что отдаёт Google Fonts. */
function readCoverage(buf) {
  const tableCount = buf.readUInt16BE(2);

  // Из нескольких подтаблиц берём самую полную: формат 12 знает символы
  // за пределами базовой плоскости, формат 4 — нет.
  let best = null;
  for (let i = 0; i < tableCount; i++) {
    const record = 4 + i * 8;
    const platform = buf.readUInt16BE(record);
    const encoding = buf.readUInt16BE(record + 2);
    const offset = buf.readUInt32BE(record + 4);
    const format = buf.readUInt16BE(offset);
    const rank = format === 12 ? 3 : platform === 3 && encoding === 1 ? 2 : 1;
    if (!best || rank > best.rank) best = { offset, format, rank };
  }
  if (!best) throw new Error('В шрифте нет таблицы символов');

  const codes = new Set();
  const { offset, format } = best;

  if (format === 4) {
    const segCountX2 = buf.readUInt16BE(offset + 6);
    const segCount = segCountX2 / 2;
    const endsAt = offset + 14;
    const startsAt = endsAt + segCountX2 + 2;
    const deltasAt = startsAt + segCountX2;
    const rangesAt = deltasAt + segCountX2;

    for (let s = 0; s < segCount; s++) {
      const end = buf.readUInt16BE(endsAt + s * 2);
      const start = buf.readUInt16BE(startsAt + s * 2);
      if (start === 0xffff) continue;
      const delta = buf.readInt16BE(deltasAt + s * 2);
      const rangeOffset = buf.readUInt16BE(rangesAt + s * 2);

      for (let code = start; code <= end; code++) {
        let glyph;
        if (rangeOffset === 0) {
          glyph = (code + delta) & 0xffff;
        } else {
          const at = rangesAt + s * 2 + rangeOffset + (code - start) * 2;
          if (at + 1 >= buf.length) continue;
          glyph = buf.readUInt16BE(at);
          if (glyph !== 0) glyph = (glyph + delta) & 0xffff;
        }
        if (glyph) codes.add(code);
      }
    }
  } else if (format === 12) {
    const groupCount = buf.readUInt32BE(offset + 12);
    for (let g = 0; g < groupCount; g++) {
      const at = offset + 16 + g * 12;
      const start = buf.readUInt32BE(at);
      const end = buf.readUInt32BE(at + 4);
      for (let code = start; code <= end; code++) codes.add(code);
    }
  } else {
    throw new Error(`Неизвестный формат таблицы символов: ${format}`);
  }

  return codes;
}

/** Имя файла: «pt-sans-400-italic-cyrillic.f283e584.woff2» → начертание. */
const FILE_RE = /^(.+?)-(\d{3})-(normal|italic)-(cyrillic-ext|cyrillic|latin-ext|latin)\.[0-9a-f]{8}\.woff2$/;

/** Обратный перевод из имени файла в имя семейства, как оно стоит в CSS. */
const FAMILY_BY_SLUG = {
  'pt-sans': 'PT Sans',
  'pt-serif': 'PT Serif',
  inter: 'Inter',
  montserrat: 'Montserrat',
  lora: 'Lora',
  'playfair-display': 'Playfair Display',
  caveat: 'Caveat',
  'marck-script': 'Marck Script',
};

const files = readdirSync(FONTS_DIR).filter((name) => name.endsWith('.woff2')).sort();
if (!files.length) {
  throw new Error(`В ${FONTS_DIR} нет ни одного шрифта — сначала запустите scripts/fetch-fonts.mjs`);
}

/** Собираем начертания: символы из шрифта, правила @font-face для браузера. */
const faces = new Map();
const rules = [];

for (const file of files) {
  const match = file.match(FILE_RE);
  if (!match) {
    console.log(`  ? ${file} — непонятное имя, пропускаем`);
    continue;
  }

  const [, slug, weight, style] = match;
  const family = FAMILY_BY_SLUG[slug];
  if (!family) {
    throw new Error(
      `Файл ${file} принадлежит неизвестному семейству «${slug}» — ` +
        'допишите его в FAMILY_BY_SLUG, иначе его метрики просто пропадут',
    );
  }

  const key = `${slug}-${weight}-${style}`;
  if (!faces.has(key)) faces.set(key, { key, family, weight: Number(weight), style, codes: new Set() });

  const tables = readWoff2Tables(readFileSync(join(FONTS_DIR, file)));
  for (const code of readCoverage(tables['cmap'])) faces.get(key).codes.add(code);

  /*
   * Шрифт вшиваем в страницу целиком, а не ссылкой на файл: страница,
   * собранная через setContent, живёт в непрозрачном источнике и читать
   * файлы с диска не вправе. Тихо не загрузившийся шрифт дал бы метрики
   * подменного — то есть ровно ту беду, от которой этот скрипт защищает.
   */
  const data = readFileSync(join(FONTS_DIR, file)).toString('base64');
  rules.push(
    `@font-face{font-family:'${family}';font-weight:${weight};font-style:${style};` +
      `src:url('data:font/woff2;base64,${data}') format('woff2');}`,
  );
}

console.log(`Начертаний: ${faces.size}, файлов: ${files.length}`);

const browser = await chromium.launch({
  channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();
await page.setContent(`<style>${rules.join('\n')}</style><body>метрики</body>`);

const request = [...faces.values()].map((f) => ({
  key: f.key,
  family: f.family,
  weight: f.weight,
  style: f.style,
  codes: [...f.codes].sort((a, b) => a - b),
}));

/**
 * Строки для замера поправки на вязь.
 *
 * Это должен быть тот текст, который реально печатается на грамотах:
 * русские ФИО, названия мероприятий, города и даты. Поправка, снятая
 * на «AVATAR Wave», описывала бы кернинг латинского капслока, которого
 * в наградных документах не бывает.
 */
const SHAPING_CORPUS = [
  'Иванов Пётр Ильич',
  'Петрова Мария Сергеевна',
  'Константинопольский Владислав Вячеславович',
  'Щёголев Юрий Аркадьевич',
  'Мамедова Айгюль Ильгаровна',
  'Ким Ён Ха',
  'Абрамов-Полянский Никита Ильич',
  'Награждается',
  'Диплом за первое место',
  'Сертификат участника',
  'Первенство области по плаванию',
  'Благодарственное письмо',
  'за активное участие и высокие результаты',
  'г. Челябинск, 17 июня 2026 года',
  'Объём курса: 72 академических часа',
  'Директор МБОУ СОШ № 15',
  'ИВАНОВ ПЁТР ИЛЬИЧ',
  'Certificate of Completion',
  'Ivanov Peter',
  'Anna Kowalska',
];

const measured = await page.evaluate(
  async ({ request, unitsPerEm, corpus }) => {
    const canvas = document.createElement('canvas').getContext('2d');
    const out = [];

    for (const face of request) {
      // Кегль равен единице измерения: тогда измеренная ширина в пикселях
      // и есть ширина в тысячных долях em, без единого преобразования.
      const font = `${face.style} ${face.weight} ${unitsPerEm}px "${face.family}"`;
      const known = new Set(face.codes);
      const sample = String.fromCodePoint(...face.codes.slice(0, 200));
      await document.fonts.load(font, sample);

      if (!document.fonts.check(font, sample)) {
        out.push({ key: face.key, failed: true, widths: [], shaping: 1 });
        continue;
      }

      canvas.font = font;
      const widths = face.codes.map((code) =>
        Math.round(canvas.measureText(String.fromCodePoint(code)).width),
      );
      const widthOf = new Map(face.codes.map((code, i) => [code, widths[i]]));

      /*
       * Поправка на вязь: во сколько раз настоящая строка отличается
       * от суммы своих букв. Считаем по сумме всего корпуса, а не как
       * среднее отношений: тогда длинные строки весят больше коротких,
       * а длинные как раз и переполняют блоки.
       */
      let real = 0;
      let naive = 0;
      let worst = 1;
      for (const line of corpus) {
        // Строки с незнакомыми буквами пропускаем целиком: браузер нарисует
        // их подменным шрифтом, и поправка получится не про этот шрифт.
        const codes = [...line].map((c) => c.codePointAt(0));
        if (codes.some((c) => !known.has(c))) continue;

        const lineReal = canvas.measureText(line).width;
        const lineNaive = codes.reduce((sum, c) => sum + widthOf.get(c), 0);
        real += lineReal;
        naive += lineNaive;
        if (lineNaive > 0) worst = Math.max(worst, lineReal / lineNaive);
      }

      out.push({
        key: face.key,
        failed: false,
        widths,
        // Без пригодных строк поправлять нечем — оставляем как есть.
        shaping: naive > 0 ? real / naive : 1,
        shapingMax: worst,
        corpusUsed: naive > 0,
      });
    }

    return out;
  },
  { request, unitsPerEm: UNITS_PER_EM, corpus: SHAPING_CORPUS },
);

await browser.close();

const failed = measured.filter((m) => m.failed);
if (failed.length) {
  // Молча пропустить нельзя: пропущенное начертание потом мерилось бы
  // подменным, и проверка врала бы именно там, где на неё положились.
  throw new Error(
    `Браузер не загрузил начертания: ${failed.map((f) => f.key).join(', ')}. ` +
      'Метрики не записаны.',
  );
}

/**
 * Ширины пишем пробегами подряд идущих кодов: «первый код, [ширины…]».
 * Посимвольный объект занимает вдвое больше, а файл лежит в репозитории,
 * и его правки видны в каждом сравнении версий.
 */
function toRuns(codes, widths) {
  const runs = [];
  let current = null;
  for (let i = 0; i < codes.length; i++) {
    if (current && codes[i] === current[0] + current[1].length) current[1].push(widths[i]);
    else {
      current = [codes[i], [widths[i]]];
      runs.push(current);
    }
  }
  return runs;
}

const byKey = new Map(measured.map((m) => [m.key, m]));
const out = { schemaVersion: 3, unitsPerEm: UNITS_PER_EM, faces: {} };

for (const face of request) {
  const m = byKey.get(face.key);
  if (!m.corpusUsed) {
    throw new Error(
      `Для «${face.key}» не нашлось ни одной строки корпуса — поправку на вязь снять не с чего. ` +
        'Метрики не записаны.',
    );
  }
  out.faces[face.key] = {
    family: face.family,
    weight: face.weight,
    style: face.style,
    // Четырёх знаков хватает: поправка меняет ширину на проценты,
    // а не на доли тысячной.
    shaping: Math.round(m.shaping * 10_000) / 10_000,
    /*
     * Худшая строка корпуса, а не средняя. Ею меряется решение
     * «влезает или нет»: у рукописных вязь гуляет от строки к строке
     * на проценты, и средняя поправка оставила бы половину строк
     * с занижённой шириной. Лишнее предупреждение стоит взгляда,
     * пропущенное обрезание — грамоты.
     */
    shapingMax: Math.round(m.shapingMax * 10_000) / 10_000,
    runs: toRuns(face.codes, m.widths),
  };
}

/*
 * Проверка на ту самую ошибку, ради которой скрипт и переписан.
 *
 * У переменного шрифта обычное и полужирное начертания различаются
 * поправками, которых нет в hmtx. Если ширины совпали до буквы — значит
 * полужирное снова снялось с обычного, и метрики врут в сторону «влезет».
 */
for (const face of request) {
  if (face.weight !== 700) continue;
  const regular = out.faces[`${face.key.replace('-700-', '-400-')}`];
  if (!regular) continue;
  const bold = out.faces[face.key];
  if (JSON.stringify(bold.runs) === JSON.stringify(regular.runs)) {
    throw new Error(
      `Полужирное «${face.key}» по ширинам совпало с обычным до буквы. ` +
        'Почти наверняка браузер взял не то начертание — метрики не записаны.',
    );
  }
}

writeFileSync(OUT_PATH, `${JSON.stringify(out)}\n`);

const glyphs = request.reduce((sum, f) => sum + f.codes.length, 0);
console.log(`\n✓ ${files.length} файлов → ${faces.size} начертаний, ${glyphs} символов`);

// Поправки печатаем: заметно отличающаяся от единицы — повод посмотреть
// на шрифт внимательнее, а не тихая мелочь внутри файла.
const shaping = [...Object.entries(out.faces)].sort((a, b) => a[1].shaping - b[1].shaping);
console.log('\nПоправка на вязь (настоящая строка / сумма букв):');
for (const [key, face] of shaping) {
  const mark = Math.abs(face.shaping - 1) > 0.02 || face.shapingMax > 1.02 ? ' ←' : '';
  console.log(
    `  ${key.padEnd(30)} средняя ${face.shaping.toFixed(4)}  худшая ${face.shapingMax.toFixed(4)}${mark}`,
  );
}

console.log(`\n✓ метрики → packages/shared/src/fonts/metrics.json`);
