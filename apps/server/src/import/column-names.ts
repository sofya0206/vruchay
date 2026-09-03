/**
 * Подбор латинского имени переменной по русскому заголовку из файла.
 *
 * Федерации присылают таблицы с шапкой вроде «ФИО», «Электронная почта», «Место».
 * Имя переменной в макете обязано быть латинским (%name), поэтому заголовок
 * нужно во что-то превратить — иначе пользователь будет вручную переименовывать
 * каждую колонку при каждом импорте.
 */

/** Известные соответствия: проверяются по вхождению, порядок важен. */
const KNOWN: [RegExp, string][] = [
  /*
   * Английские написания рядом с русскими: судейские программы и
   * международные соревнования выгружают шапку на латинице, и без них
   * колонка «Name» не опознавалась как ФИО — участник уезжал в импорт
   * безымянным.
   */
  [
    /^(фио|ф\.и\.о|фамилия имя отчество|участник|спортсмен|полное имя|name|full ?name|participant|athlete)/i,
    'name',
  ],
  [/(e-?mail|почт|электрон)/i, 'email'],
  [/(телефон|моб|phone)/i, 'phone'],
  [/(отчество|patronymic|middle ?name)/i, 'patronymic'],
  [/^(фамилия|surname|last ?name|family ?name)/i, 'surname'],
  [/^(имя|first ?name|given ?name|first)/i, 'firstname'],
  [/(мест[оа]|place|rank)/i, 'place'],
  [/(результат|время|result)/i, 'result'],
  [/(разряд|категор|group|катег)/i, 'category'],
  [/(команда|клуб|организац|общество|team|club)/i, 'team'],
  [/(тренер|coach)/i, 'coach'],
  [/(дисциплин|вид|событ|мероприят|курс|семинар)/i, 'event'],
  [/(дата|date)/i, 'date'],
  [/(город|region|регион)/i, 'city'],
  [/(номер|№|id)/i, 'number'],
];

/**
 * Эталонные написания тех же полей — для сравнения по расстоянию Левенштейна.
 *
 * Нужны потому, что шапку набирают руками и в ней есть опечатки: «Фамиля»,
 * «Отчетсво», «Электроная почта», «Телфон». По вхождению такие заголовки
 * не ловятся и уезжают в транслитерацию — пользователь переименовывает
 * колонку руками, хотя ошибка на один символ.
 */
const CANONICAL: [string, string][] = [
  ['фио', 'name'],
  ['фамилияимяотчество', 'name'],
  ['полноеимя', 'name'],
  ['name', 'name'],
  ['fullname', 'name'],
  ['participant', 'name'],
  ['lastname', 'surname'],
  ['firstname', 'firstname'],
  ['участник', 'name'],
  ['спортсмен', 'name'],
  ['электроннаяпочта', 'email'],
  ['почта', 'email'],
  ['email', 'email'],
  ['телефон', 'phone'],
  ['мобильный', 'phone'],
  ['отчество', 'patronymic'],
  ['фамилия', 'surname'],
  ['имя', 'firstname'],
  ['место', 'place'],
  ['результат', 'result'],
  ['категория', 'category'],
  ['разряд', 'category'],
  ['команда', 'team'],
  ['организация', 'team'],
  ['тренер', 'coach'],
  ['мероприятие', 'event'],
  ['дисциплина', 'event'],
  ['дата', 'date'],
  ['город', 'city'],
  ['регион', 'city'],
  ['номер', 'number'],
];

const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i',
  й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't',
  у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '',
  э: 'e', ю: 'yu', я: 'ya',
};

function transliterate(value: string): string {
  return value
    .toLowerCase()
    .split('')
    .map((ch) => TRANSLIT[ch] ?? ch)
    .join('');
}

/** Оставляет только буквы и цифры: «Ф.И.О. участника» и «фио участника» — одно и то же. */
function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9]+/gi, '');
}

/**
 * Расстояние Левенштейна с ранним выходом.
 *
 * Считаем на двух строках матрицы, а не на всей: заголовки короткие,
 * но функция вызывается на каждой паре «колонка × эталон».
 */
export function levenshtein(a: string, b: string, max = Infinity): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > max) return max + 1;
    [prev, curr] = [curr, prev];
  }

  return prev[b.length];
}

const MAX_DISTANCE = 2;

/** Длина эталона, начиная с которой две правки — всё ещё опечатка, а не другое слово. */
const LONG_ENOUGH = 6;

/**
 * Заголовки, которые похожи на известные поля, но значат другое.
 *
 * «Месяц» отличается от «места» двумя правками, «класс» и «группа» —
 * тоже соседи по написанию. В детских соревнованиях эти колонки есть
 * почти всегда, и молча превратить месяц в место — значит напечатать
 * на грамоте «3 место» там, где в файле был март.
 */
const STOP_WORDS = new Set([
  'месяц',
  'класс',
  'группа',
  'возраст',
  'оценка',
  'пол',
  'номер',
]);

/**
 * Похоже ли написанное на эталон настолько, чтобы считать это опечаткой.
 *
 * Порог зависит от длины эталона. Две правки на коротком слове — это уже
 * другое слово: «месяц» и «место» отличаются ровно на две, и оба длиной
 * в пять букв. Поэтому эталонам короче шести букв разрешена одна правка,
 * и сверх того требуем, чтобы правок было меньше половины короткого слова.
 */
function isTypoOf(value: string, canonical: string): number | null {
  if (value.length < 3 || canonical.length < 3) return null;
  const limit = canonical.length < LONG_ENOUGH ? 1 : MAX_DISTANCE;
  const distance = levenshtein(value, canonical, limit);
  if (distance > limit) return null;
  if (distance * 2 >= Math.min(value.length, canonical.length)) return null;
  return distance;
}

/**
 * Имя известного поля по заголовку: сначала точный словарь, потом опечатки.
 * `null` — заголовок ни на что известное не похож.
 */
export function matchKnownField(header: string): string | null {
  const trimmed = header.trim();

  for (const [pattern, name] of KNOWN) {
    if (pattern.test(trimmed)) return name;
  }

  const normalized = normalize(trimmed);
  if (!normalized) return null;
  // Стоп-слова отсекаем только на нечётком шаге: если такое слово есть
  // в самом словаре («Номер»), оно уже вернулось точным совпадением выше.
  if (STOP_WORDS.has(normalized)) return null;

  let best: { name: string; distance: number } | null = null;
  for (const [canonical, name] of CANONICAL) {
    const distance = isTypoOf(normalized, canonical);
    if (distance === null) continue;
    // При равенстве держимся порядка списка: он от частого к редкому.
    if (!best || distance < best.distance) best = { name, distance };
  }

  return best?.name ?? null;
}

/** Приводит произвольный заголовок к допустимому имени переменной. */
export function suggestColumnName(header: string, taken: Set<string> = new Set()): string {
  const trimmed = header.trim();

  let base = matchKnownField(trimmed) ?? '';

  if (!base) {
    base = transliterate(trimmed)
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .replace(/^([0-9])/, 'c$1')
      .slice(0, 40);
  }

  if (!base) base = 'column';

  // Одинаковые заголовки встречаются часто («Дата» дважды) — разводим суффиксом.
  let candidate = base;
  let n = 2;
  while (taken.has(candidate)) candidate = `${base}_${n++}`;
  return candidate;
}

/** Сколько строк смотрим, когда заголовок ничего не подсказал. */
const SAMPLE_ROWS = 20;

/** Доля совпадений, при которой считаем догадку подтверждённой. */
const SAMPLE_SHARE = 0.6;

const EMAIL_RE = /^[^\s@]+@[^\s@]+$/;
/** Три слова с заглавной буквы — «Иванов Иван Иванович». */
const FULL_NAME_RE = /^[А-ЯЁA-Z][а-яёa-z-]+(\s+[А-ЯЁA-Z][а-яёa-z-]+){2}$/;

function isSmallNumber(value: string): boolean {
  if (!/^\d{1,2}$/.test(value)) return false;
  const n = Number(value);
  return n >= 1 && n <= 10;
}

/**
 * Похожа ли колонка на призовые места.
 *
 * Одних чисел от одного до десяти мало: под них подходят класс, группа,
 * возраст и оценка — у детских соревнований эти колонки есть почти всегда.
 * Места отличает то, что они не повторяются и начинаются с первого:
 * ряд без единицы — не итоговый протокол, а ряд с повторами — деление
 * на группы. Ошибиться здесь дороже, чем не угадать: колонка «Класс»,
 * ставшая местом, печатает на грамоте «5 место» вместо пятого класса.
 */
function looksLikePlaces(sample: string[]): boolean {
  if (!sample.includes('1')) return false;
  if (new Set(sample).size !== sample.length) return false;
  return sample.filter(isSmallNumber).length / sample.length >= SAMPLE_SHARE;
}

/**
 * Догадка по значениям колонки — на случай, когда шапки нет или в ней
 * написано что-то своё («Столбец3», «Участники 2026»).
 *
 * Смотрим не одну первую строку, а выборку: первая строка бывает
 * итоговой, пустой или с примечанием, и одна такая строка увела бы
 * всю колонку не туда.
 */
export function guessByValues(values: string[]): string | null {
  const sample = values.slice(0, SAMPLE_ROWS).map((v) => v.trim()).filter(Boolean);
  if (!sample.length) return null;

  const share = (test: (v: string) => boolean) =>
    sample.filter(test).length / sample.length;

  if (share((v) => EMAIL_RE.test(v)) >= SAMPLE_SHARE) return 'email';
  if (share((v) => FULL_NAME_RE.test(v)) >= SAMPLE_SHARE) return 'name';
  if (looksLikePlaces(sample)) return 'place';

  return null;
}

/** Колонка файла после уточнения по данным. */
export interface RefinedColumn {
  source: string;
  suggested: string;
  /**
   * Имя подобрано по значениям колонки, а не по её заголовку.
   * Интерфейс показывает это отдельно: догадка о данных куда менее
   * надёжна, чем прочитанная шапка, и проверять её нужно глазами.
   */
  guessed: boolean;
}

/**
 * Уточняет имена колонок по данным.
 *
 * Применяется только там, где заголовок не распознан: если в шапке
 * написано «Место», а в колонке лежат адреса почты, верить надо шапке —
 * это её колонка, и переименование сломало бы уже сделанный макет.
 */
export function refineColumns(
  columns: { source: string; suggested: string }[],
  rows: string[][],
): RefinedColumn[] {
  const refined: RefinedColumn[] = columns.map((c) => ({ ...c, guessed: false }));
  const taken = new Set(refined.map((c) => c.suggested));

  refined.forEach((column, index) => {
    if (matchKnownField(column.source)) return;

    const guess = guessByValues(rows.map((row) => row[index] ?? ''));
    // Занятое имя не трогаем: две колонки «email» заблокировали бы импорт,
    // а разводить их суффиксом здесь — значит выдать догадку за находку.
    if (!guess || taken.has(guess)) return;

    taken.delete(column.suggested);
    taken.add(guess);
    column.suggested = guess;
    column.guessed = true;
  });

  return refined;
}
