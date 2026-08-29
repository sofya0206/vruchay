import { inflateSync } from 'node:zlib';

/**
 * Текст из готового PDF — ровно настолько, насколько нужно проверке.
 *
 * Полноценного разбора PDF в зависимостях нет, а тащить его ради одного
 * утверждения незачем. Здесь разобран тот PDF, который выдаёт Chromium
 * (Skia/PDF): шрифты подмножеством, кодировка Identity-H, к каждому
 * шрифту приложена таблица ToUnicode. То есть в потоке страницы лежат
 * номера начертаний, а не буквы, — и без ToUnicode «фамилия в PDF»
 * не ищется вовсе.
 *
 * Проверка нужна ровно за этим: «выпуск прошёл» ничего не значит, пока
 * никто не заглянул внутрь файла. Пустой лист весит столько же, сколько
 * заполненный.
 */
export function pdfText(pdf: Buffer): string {
  const objects = parseObjects(pdf);
  const pages = [...objects.values()].filter((o) => /\/Type\s*\/Page[^s]/.test(o.dict));

  const out: string[] = [];
  for (const page of pages) {
    const fonts = fontsOf(page.dict, objects);
    for (const content of contentsOf(page.dict, objects)) {
      out.push(decodeContent(content, fonts));
    }
  }
  return out.join('\n');
}

interface PdfObject {
  dict: string;
  stream: Buffer | null;
}

/**
 * Объекты файла. Границы потока берём из /Length, а не поиском слова
 * «endstream»: внутри сжатого шрифта встречается любая последовательность
 * байтов, включая ту, по которой мы ищем.
 */
function parseObjects(pdf: Buffer): Map<number, PdfObject> {
  const raw = pdf.toString('latin1');
  const objects = new Map<number, PdfObject>();
  const header = /(\d+)\s+0\s+obj/g;

  let match: RegExpExecArray | null;
  while ((match = header.exec(raw)) !== null) {
    const start = match.index + match[0].length;
    const streamAt = raw.indexOf('stream', start);
    const endAt = raw.indexOf('endobj', start);
    const hasStream = streamAt !== -1 && (endAt === -1 || streamAt < endAt);

    if (!hasStream) {
      objects.set(Number(match[1]), {
        dict: raw.slice(start, endAt === -1 ? raw.length : endAt),
        stream: null,
      });
      continue;
    }

    const dict = raw.slice(start, streamAt);
    let from = streamAt + 'stream'.length;
    if (raw[from] === '\r') from++;
    if (raw[from] === '\n') from++;

    const length = /\/Length\s+(\d+)/.exec(dict);
    const to = length ? from + Number(length[1]) : raw.indexOf('endstream', from);
    const body = pdf.subarray(from, to);

    objects.set(Number(match[1]), {
      dict,
      stream: /\/FlateDecode/.test(dict) ? inflate(body) : body,
    });
    header.lastIndex = to;
  }

  return objects;
}

function inflate(body: Buffer): Buffer | null {
  try {
    return inflateSync(body);
  } catch {
    return null;
  }
}

/** Потоки содержимого страницы: /Contents может быть и ссылкой, и списком. */
function contentsOf(pageDict: string, objects: Map<number, PdfObject>): string[] {
  const single = /\/Contents\s+(\d+)\s+0\s+R/.exec(pageDict);
  if (single) {
    const stream = objects.get(Number(single[1]))?.stream;
    return stream ? [stream.toString('latin1')] : [];
  }

  const list = /\/Contents\s*\[([^\]]*)\]/.exec(pageDict);
  if (!list) return [];
  return [...list[1].matchAll(/(\d+)\s+0\s+R/g)]
    .map((ref) => objects.get(Number(ref[1]))?.stream)
    .filter((stream): stream is Buffer => stream !== null && stream !== undefined)
    .map((stream) => stream.toString('latin1'));
}

/** Имя шрифта на странице (F4, F5…) → таблица «номер начертания → буква». */
function fontsOf(
  pageDict: string,
  objects: Map<number, PdfObject>,
): Map<string, Map<number, string>> {
  const fonts = new Map<string, Map<number, string>>();
  const block = /\/Font\s*<<([\s\S]*?)>>/.exec(pageDict);
  if (!block) return fonts;

  for (const entry of block[1].matchAll(/\/([A-Za-z0-9]+)\s+(\d+)\s+0\s+R/g)) {
    const font = objects.get(Number(entry[2]));
    if (!font) continue;
    const toUnicode = /\/ToUnicode\s+(\d+)\s+0\s+R/.exec(font.dict);
    if (!toUnicode) continue;
    const table = objects.get(Number(toUnicode[1]))?.stream;
    if (table) fonts.set(entry[1], parseCMap(table.toString('latin1')));
  }
  return fonts;
}

/** Таблица ToUnicode: beginbfchar по одному коду, beginbfrange отрезками. */
function parseCMap(cmap: string): Map<number, string> {
  const table = new Map<number, string>();

  for (const section of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const pair of section[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      table.set(parseInt(pair[1], 16), utf16(pair[2]));
    }
  }

  for (const section of cmap.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    // Отрезок «от, до, начало» — коды идут подряд и буквы тоже.
    for (const range of section[1].matchAll(
      /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g,
    )) {
      const from = parseInt(range[1], 16);
      const to = parseInt(range[2], 16);
      const first = parseInt(range[3], 16);
      for (let code = from; code <= to; code++) {
        table.set(code, String.fromCodePoint(first + (code - from)));
      }
    }
    // Отрезок со списком: каждому коду своя буква.
    for (const range of section[1].matchAll(
      /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*\[([^\]]*)\]/g,
    )) {
      const from = parseInt(range[1], 16);
      const items = [...range[3].matchAll(/<([0-9A-Fa-f]+)>/g)];
      items.forEach((item, index) => table.set(from + index, utf16(item[1])));
    }
  }

  return table;
}

/** Буква (или пара суррогатов) из шестнадцатеричной записи UTF-16BE. */
function utf16(hex: string): string {
  const units: number[] = [];
  for (let i = 0; i + 3 < hex.length; i += 4) units.push(parseInt(hex.slice(i, i + 4), 16));
  return String.fromCharCode(...units);
}

/**
 * Поток страницы: нас интересуют только выбор шрифта и показ строки.
 * Всё остальное — координаты, обводки, состояние — к тексту отношения
 * не имеет.
 */
function decodeContent(content: string, fonts: Map<string, Map<number, string>>): string {
  const tokens = /\/([A-Za-z0-9]+)\s+[\d.-]+\s+Tf|<([0-9A-Fa-f\s]*)>\s*Tj|\[([^\]]*)\]\s*TJ/g;
  let font: Map<number, string> | undefined;
  const out: string[] = [];

  let token: RegExpExecArray | null;
  while ((token = tokens.exec(content)) !== null) {
    if (token[1] !== undefined) {
      font = fonts.get(token[1]);
      continue;
    }
    if (token[2] !== undefined) {
      out.push(decodeHex(token[2], font));
      continue;
    }
    for (const piece of token[3].matchAll(/<([0-9A-Fa-f\s]*)>/g)) {
      out.push(decodeHex(piece[1], font));
    }
  }

  return out.join('');
}

/** Коды двухбайтовые: Chromium пишет шрифты в кодировке Identity-H. */
function decodeHex(hex: string, font: Map<number, string> | undefined): string {
  const digits = hex.replace(/\s+/g, '');
  let out = '';
  for (let i = 0; i + 3 < digits.length; i += 4) {
    const code = parseInt(digits.slice(i, i + 4), 16);
    out += font?.get(code) ?? '';
  }
  return out;
}
