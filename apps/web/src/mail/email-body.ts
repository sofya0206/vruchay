/**
 * Перевод между тем, что человек печатает, и разметкой письма.
 *
 * Человек видит обычный текст с пустыми строками между абзацами — так же,
 * как пишет письмо в почте. Разметку собирает сервис. До этого в поле
 * лежало «<p>Здравствуйте, %name!</p>», и это прямо противоречило задаче
 * сделать понятно обычному человеку.
 *
 * Набор возможностей узкий намеренно: полужирный, курсив, ссылка. Почтовые
 * клиенты понимают ограниченный набор тегов, и то, что красиво в браузере,
 * в Outlook разъезжается. Дать здесь произвольную вёрстку значит дать
 * способ испортить письмо, не заметив этого.
 */

/** Экранирование: текст участника не должен превращаться в разметку. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Кусок абзаца: обычный текст, начертание, ссылка или перенос строки. */
export type Run =
  | { kind: 'text' | 'bold' | 'italic'; text: string }
  | { kind: 'link'; text: string; href: string }
  | { kind: 'break' };

/**
 * Разбор набранного текста на абзацы и куски.
 *
 * Единственное место, где решается, что считать начертанием и что ссылкой.
 * И письмо, и предпросмотр строятся из результата этого разбора — иначе
 * они разошлись бы, и человек утверждал бы письмо по картинке, которая
 * не соответствует отправляемому.
 *
 * Пустая строка разделяет абзацы, одиночный перенос — перенос внутри абзаца.
 * Так устроен любой знакомый человеку редактор.
 */
export function parseBody(text: string): Run[][] {
  return text
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map(parseParagraph);
}

/*
 * Разметка выбрана та, что человек и так набирает в мессенджерах:
 * *полужирный*, _курсив_. Ссылка распознаётся сама — по адресу в тексте,
 * потому что просить оформить ссылку значит вернуть человека к разметке.
 *
 * Хвостовую пунктуацию в ссылку не забираем: «зайдите на https://vruchay.ru.»
 * не должно давать ссылку с точкой на конце — такая ссылка не открывается.
 *
 * Поле `%ключ` разбирается первым и целиком: подчёркивание внутри ключа
 * не открывает курсив. Иначе «%last_name %first_name» давало курсив
 * «name %first», и оба поля в письме ломались.
 */
const FIELD = '%[a-zA-Z][a-zA-Z0-9_]*';
const INLINE_RE = new RegExp(
  `(${FIELD})|\\*([^*\\n]+)\\*|_((?:${FIELD}|[^_\\n])+)_|(https?:\\/\\/[^\\s]+[^\\s.,;:!?)])|\\n`,
  'g',
);

function parseParagraph(paragraph: string): Run[] {
  const runs: Run[] = [];
  const pushText = (text: string) => {
    const prev = runs.at(-1);
    if (prev?.kind === 'text') prev.text += text;
    else runs.push({ kind: 'text', text });
  };
  let last = 0;

  for (const m of paragraph.matchAll(INLINE_RE)) {
    if (m.index > last) pushText(paragraph.slice(last, m.index));

    if (m[1] !== undefined) pushText(m[1]);
    else if (m[2] !== undefined) runs.push({ kind: 'bold', text: m[2] });
    else if (m[3] !== undefined) runs.push({ kind: 'italic', text: m[3] });
    else if (m[4] !== undefined) runs.push({ kind: 'link', text: m[4], href: m[4] });
    else runs.push({ kind: 'break' });

    last = m.index + m[0].length;
  }

  if (last < paragraph.length) pushText(paragraph.slice(last));
  return runs;
}

/** Текст → разметка письма. */
export function toHtml(text: string): string {
  return parseBody(text)
    .map((runs) => `<p>${runs.map(runToHtml).join('')}</p>`)
    .join('\n');
}

function runToHtml(run: Run): string {
  switch (run.kind) {
    case 'break':
      return '<br>';
    case 'bold':
      return `<b>${escapeHtml(run.text)}</b>`;
    case 'italic':
      return `<i>${escapeHtml(run.text)}</i>`;
    case 'link':
      return `<a href="${escapeHtml(run.href)}">${escapeHtml(run.text)}</a>`;
    default:
      return escapeHtml(run.text);
  }
}

/**
 * Разметка → текст, для показа в поле ввода.
 *
 * Нужен, потому что письма, сохранённые раньше, лежат в базе разметкой,
 * и открыть их в новом редакторе иначе невозможно. Без обратного перевода
 * человек увидел бы в поле теги — ровно то, от чего уходим.
 */
export function toText(html: string): string {
  return html
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\/\s*p\s*>/gi, '\n\n')
    .replace(/<\s*(b|strong)\s*>([\s\S]*?)<\/\s*\1\s*>/gi, '*$2*')
    .replace(/<\s*(i|em)\s*>([\s\S]*?)<\/\s*\1\s*>/gi, '_$2_')
    // У ссылки оставляем адрес: он и так распознается обратно.
    .replace(/<\s*a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/\s*a\s*>/gi, (_all, href, label) =>
      label.trim() === href.trim() ? href : `${label} (${href})`,
    )
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Обернуть выделенное начертанием.
 *
 * Возвращает новый текст и куда поставить курсор: без этого после нажатия
 * кнопки курсор прыгал бы в конец, и набирать дальше было бы невозможно.
 */
export function wrapSelection(
  text: string,
  start: number,
  end: number,
  marker: '*' | '_',
): { text: string; selectionStart: number; selectionEnd: number } {
  const selected = text.slice(start, end);

  // Нажали второй раз на уже обёрнутом — снимаем начертание.
  const already =
    selected.length > 2 && selected.startsWith(marker) && selected.endsWith(marker);
  if (already) {
    const inner = selected.slice(1, -1);
    return {
      text: text.slice(0, start) + inner + text.slice(end),
      selectionStart: start,
      selectionEnd: start + inner.length,
    };
  }

  // Ничего не выделено — вставляем пару и ставим курсор между ними,
  // чтобы человек сразу печатал внутри.
  if (!selected) {
    return {
      text: `${text.slice(0, start)}${marker}${marker}${text.slice(end)}`,
      selectionStart: start + 1,
      selectionEnd: start + 1,
    };
  }

  return {
    text: `${text.slice(0, start)}${marker}${selected}${marker}${text.slice(end)}`,
    selectionStart: start + 1,
    selectionEnd: end + 1,
  };
}
