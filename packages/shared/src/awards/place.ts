/**
 * Разбор занятого места из ячейки протокола.
 *
 * В `RecipientRow.data` всё лежит строками, а место в реальных протоколах
 * пишут как угодно: «1», «1.», «I», «1 место», «1-е», «2-3» при делёжке,
 * «б/м» у тех, кто места не занял, и просто пусто. Сравнивать такое
 * строкой нельзя: правило «место равно 1» промахнулось бы мимо «1 место»
 * и мимо «I», а делёжка «2-3» не попала бы ни в одно правило вообще.
 *
 * Главное правило файла: **в сомнении возвращаем null**. Неразобранное
 * место движок покажет отдельным замечанием, и человек решит сам. Догадка
 * здесь хуже отказа: она молча выдаёт диплом победителя не тому.
 */

/**
 * Место как диапазон, а не число.
 *
 * Делёжка мест — не редкость, а норма: при равном результате два участника
 * получают «2-3», и оба по регламенту награждаются как призёры. Одно число
 * заставило бы выбрать между 2 и 3, то есть заведомо обидеть одного из двух.
 */
export interface PlaceRange {
  /** Наименьшее место диапазона. Для «2-3» это 2. */
  from: number;
  /** Наибольшее. Для одиночного места совпадает с from. */
  to: number;
  /** Место поделено между несколькими участниками. */
  shared: boolean;
}

/** Свыше этого — уже не место, а чей-то результат или номер, попавший не в ту графу. */
const MAX_PLACE = 300;

/** Отметки «места нет»: такие участники награждаются не по месту. */
const NO_PLACE = /^(б\/?м|без\s*места|вне\s*конкурса|н\/?к|нет|no\s*place)$/;

/** Любое из тире, которыми в протоколах записывают делёжку. */
const DASH = /[-–—‒]/;

/**
 * Латиница на месте похожих кириллических букв.
 *
 * «III место», набранное в русской раскладке, приезжает кириллическими
 * «х» и «с». Различить их глазами в таблице невозможно, а разобрать
 * как римскую цифру — можно.
 */
const LOOKALIKE: Record<string, string> = { і: 'i', х: 'x', с: 'c', ӏ: 'i' };

const ROMAN_DIGITS: [number, string][] = [
  [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'],
  [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i'],
];

/** Общая подготовка: регистр, ё, неразрывные пробелы, хвостовая пунктуация. */
function normalize(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    // Хвостовая пунктуация снимается после trim: «3. » иначе осталась бы с точкой.
    .replace(/[.,;:]+$/g, '')
    .trim();
}

/**
 * Снимает всё, что не относится к самому числу: слово «место», порядковое
 * окончание через дефис, одинокое «м.» после числа.
 *
 * Порядковые окончания убираются до разбора делёжки: иначе «1-е» приняли бы
 * за начало диапазона и потеряли бы место целиком.
 */
function stripWords(value: string): string {
  return value
    .replace(/мест[оа]?/g, ' ')
    .replace(/place/g, ' ')
    .replace(/(\d)\s*-\s*(е|й|я|ое|ый|ая|ье|ья)(?=\s|$)/g, '$1')
    .replace(/(^|\s)м\.?(?=\s|$)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toRoman(n: number): string {
  let rest = n;
  let out = '';
  for (const [value, digit] of ROMAN_DIGITS) {
    while (rest >= value) {
      out += digit;
      rest -= value;
    }
  }
  return out;
}

/**
 * Римская цифра. Принимаем только каноническую запись: разбираем и тут же
 * собираем обратно. Без этой сверки «ill» превратилось бы в 99, а любая
 * случайная буква — в место.
 */
function parseRoman(value: string): number | null {
  const latin = value
    .split('')
    .map((ch) => LOOKALIKE[ch] ?? ch)
    .join('');
  if (!/^[ivxlc]+$/.test(latin)) return null;

  for (let n = 1; n <= MAX_PLACE; n++) {
    if (toRoman(n) === latin) return n;
  }
  return null;
}

function parseSingle(value: string): number | null {
  if (/^\d+$/.test(value)) {
    const n = Number(value);
    return n >= 1 && n <= MAX_PLACE ? n : null;
  }
  return parseRoman(value);
}

/**
 * Разбирает ячейку с местом. null значит «места нет» — и когда ячейка пуста,
 * и когда написанное не удалось понять. Для награждения это одно и то же,
 * но движок различает случаи по hasPlaceText и сообщает о втором отдельно.
 */
export function parsePlace(raw: string | null | undefined): PlaceRange | null {
  if (raw === null || raw === undefined) return null;

  const base = normalize(String(raw));
  if (base === '') return null;
  // Проверяем до снятия слов: в «без места» и «б/м» само слово и есть смысл.
  if (NO_PLACE.test(base)) return null;

  let value = stripWords(base);
  if (value === '') return null;
  // Одинокое тире в графе места значит то же, что пусто.
  if (new RegExp(`^${DASH.source}+$`).test(value)) return null;

  /*
   * «=3» — так делёж места записывает судейский софт: место третье,
   * и оно с кем-то поделено. Без этой строки «=3» не разбирался вовсе,
   * призёр проваливался мимо правила «место с 2 по 3» в правило «иначе»
   * и получал грамоту участника вместо диплома. Предупреждение при этом
   * выдавалось, но документ уже был напечатан не тот.
   */
  const tiedMark = value.startsWith('=');
  if (tiedMark) value = value.slice(1).trim();
  if (value === '') return null;

  const parts = value.split(DASH);
  if (parts.length === 2) {
    const from = parseSingle(parts[0].trim());
    const to = parseSingle(parts[1].trim());
    if (from === null || to === null) return null;
    // «3-2» встречается как опечатка; порядок восстанавливаем молча —
    // смысл записи от него не меняется.
    return { from: Math.min(from, to), to: Math.max(from, to), shared: tiedMark || from !== to };
  }
  if (parts.length > 2) return null;

  const single = parseSingle(value);
  return single === null ? null : { from: single, to: single, shared: tiedMark };
}

/**
 * Попадает ли место в интервал правила.
 *
 * Проверяем пересечение диапазонов, а не вхождение числа: делёжка «2-3»
 * обязана попасть в правило «с 1 по 3 место», иначе призёр останется
 * без диплома из-за того, что с кем-то разделил результат.
 */
export function placeMatches(place: PlaceRange, from: number, to: number): boolean {
  const low = Math.min(from, to);
  const high = Math.max(from, to);
  return place.from <= high && place.to >= low;
}

/** Есть ли в ячейке хоть что-то: отличает «пусто» от «написано, но не разобрали». */
export function hasPlaceText(raw: string | null | undefined): boolean {
  return String(raw ?? '').trim() !== '';
}

/**
 * Ячейка явно говорит «места нет»: «б/м», «без места», «вне конкурса», прочерк.
 *
 * Отдельно от разбора, потому что для человека это разные вещи. «б/м» —
 * решение судейской коллегии, записанное как положено; «см. приложение» —
 * то, что мы не поняли. Жаловаться на первое значит приучить организатора
 * пролистывать отчёт не глядя, а там же лежит и второе.
 */
export function isNoPlace(raw: string | null | undefined): boolean {
  const base = normalize(String(raw ?? ''));
  if (base === '') return true;
  if (NO_PLACE.test(base)) return true;
  return new RegExp(`^${DASH.source}+$`).test(base);
}

/**
 * В ячейке что-то написано, это не отметка «места нет», и разобрать не вышло.
 * Ровно этот случай стоит показать человеку.
 */
export function isUnparsablePlace(raw: string | null | undefined): boolean {
  return hasPlaceText(raw) && !isNoPlace(raw) && parsePlace(raw) === null;
}
