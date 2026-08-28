import petrovich from 'petrovich';

/**
 * Склонение ФИО — чтобы на грамоте было «Награждается Иванову Петру Ильичу»,
 * а не «Награждается Иванов Пётр Ильич».
 *
 * Это первое, что называют организаторы, когда спрашиваешь, чего не хватает
 * в готовых конструкторах: наградные документы почти всегда написаны
 * в дательном падеже, и сейчас ради этого заводят вторую колонку в таблице
 * и заполняют её руками на триста человек.
 *
 * Главное правило всего файла: **в сомнении не склоняем**. Возвращаем
 * исходную строку как есть. Грамота с фамилией в именительном падеже
 * выглядит слегка casually; грамота с фамилией, испорченной нашей
 * догадкой, — это испорченная грамота, и заметит это не разработчик,
 * а человек на сцене.
 */

/** Падежи, которые petrovich знает и которые нам осмысленно предлагать. */
export type GrammaticalCase = 'dative' | 'genitive';

/**
 * Почему мы не уверены в склонении.
 *
 * Коды, а не готовые фразы: показывать их будет отчёт проверки списка,
 * и там формулировка подбирается под колонку таблицы, а не под нас.
 */
export type DeclensionDoubt =
  | 'not-cyrillic'
  | 'too-many-words'
  | 'unrecognized'
  | 'foreign-surname'
  | 'indeclinable-surname'
  | 'unknown-gender'
  | 'petrovich-failed';

/** Человеческие пояснения к кодам — для отчёта проверки перед выпуском. */
export const DECLENSION_DOUBT_TEXT: Record<DeclensionDoubt, string> = {
  'not-cyrillic': 'Не кириллица — оставлено без изменений',
  'too-many-words': 'Больше трёх слов — разобрать надёжно нельзя',
  unrecognized: 'Не удалось понять, где фамилия и где имя',
  'foreign-surname': 'Фамилия нерусская по форме — проверьте окончание',
  'indeclinable-surname': 'Такая фамилия не изменяется — проверьте, так ли задумано',
  'unknown-gender': 'Пол не определён — окончания могли остаться мужскими',
  'petrovich-failed': 'Правила склонения не сошлись',
};

/**
 * Насколько мы уверены.
 *
 * Двух уровней сомнения мало для отчёта проверки: списки из Черноземья,
 * Кубани, Беларуси и Украины наполовину состоят из фамилий на -ко и -ук,
 * и если каждую помечать наравне с неразобранной строкой, отчёт станет
 * сплошной красной простынёй, в которой настоящую поломку никто не найдёт.
 *
 * Поэтому:
 *  — `low` — мы не склонили или могли испортить. Показывать обязательно.
 *  — `medium` — по правилу языка всё верно, но подтвердить может только
 *    тот, кто знает получателя. Место такому — в свёрнутом списке.
 *  — `high` — обычная русская фамилия, разобранная без оговорок.
 */
export type DeclensionConfidence = 'high' | 'medium' | 'low';

/**
 * Насколько серьёзно каждое сомнение.
 *
 * `low` — значение не изменилось или могло быть искажено: латиница,
 * длинная запись, неразобранный порядок слов, неизвестный пол
 * (petrovich при неизвестном поле возвращает имя нетронутым, и на грамоте
 * останется именительный падеж).
 *
 * `medium` — склонение выполнено по правилу и, скорее всего, верно:
 * «Коваленко Олегу», «Ким Ольге», «Петросяну Армену».
 */
export const DECLENSION_DOUBT_LEVEL: Record<DeclensionDoubt, 'low' | 'medium'> = {
  'not-cyrillic': 'low',
  'too-many-words': 'low',
  unrecognized: 'low',
  'petrovich-failed': 'low',
  'unknown-gender': 'low',
  'foreign-surname': 'medium',
  'indeclinable-surname': 'medium',
};

/** Значение и отдельно — признак того, что его стоит показать человеку. */
export interface DeclensionCheck {
  /** Что подставить в макет. Отдаётся всегда, даже когда мы не уверены. */
  value: string;
  /** Не «значение неверно», а «вот насколько стоит присмотреться». */
  confidence: DeclensionConfidence;
  doubts: DeclensionDoubt[];
}

/** Уровень по набору сомнений: худшее из них и решает. */
export function declensionConfidence(doubts: DeclensionDoubt[]): DeclensionConfidence {
  if (doubts.some((d) => DECLENSION_DOUBT_LEVEL[d] === 'low')) return 'low';
  return doubts.length > 0 ? 'medium' : 'high';
}

/**
 * Отчество: «Ильич», «Кузьмич», «Ивановна», «Ильинична».
 *
 * Женские проверяем по «вна»/«чна», а не по «на»: иначе отчеством станут
 * Анна, Елена, Полина и половина женских имён.
 */
const PATRONYMIC = /(ич|ыч|вна|чна|шна)$/i;

/**
 * Приметы фамилии. Список неполон — полного и не существует, — поэтому
 * служит подсказкой при выборе порядка слов, а не приговором.
 */
const SURNAME = /(ов|ев|ёв|ин|ын|ский|цкий|ской|цкой|ова|ева|ёва|ина|ына|ская|цкая|их|ых|енко|ко|ук|юк|ян|швили|дзе|ая|яя)$/i;

/** Кириллица, дефис, пробел, точка. Всё остальное — не то, что мы умеем. */
const CYRILLIC_NAME = /^[А-Яа-яЁё][А-Яа-яЁё\-.\s]*$/;

export interface Parts {
  first?: string;
  middle?: string;
  last?: string;
}

/**
 * Склоняет полное имя из одной строки.
 *
 * На вход приходит то, что организатор написал в колонке: «Иванов Пётр
 * Ильич», «Мария Петрова», «Иванов П.И.». Разбираем сами — просить
 * заполнять три колонки вместо одной значит переложить на человека
 * работу, ради избавления от которой он к нам и пришёл.
 */
export function declineFullName(fullName: string, grammaticalCase: GrammaticalCase): string {
  return declineFullNameChecked(fullName, grammaticalCase).value;
}

/**
 * То же склонение, но с честным ответом «я не уверен».
 *
 * Признак уверенности отделён от значения намеренно. Значение мы отдаём
 * всегда — генерация не должна вставать из-за одной странной фамилии.
 * А вот проверка списка перед выпуском (задача 9.3) обязана показать
 * такие строки человеку: несклоняемую фамилию, иностранную, слишком
 * длинную запись. Молчаливый пропуск здесь — это триста грамот,
 * напечатанных с ошибкой, которую никто не увидел до вручения.
 *
 * `confidence` — это не «значение неверное», а «вот насколько стоит
 * присмотреться»: `low` мы не склонили или могли испортить, `medium`
 * склонили по правилу и, скорее всего, верно («Коваленко Ольге»), но
 * подтвердить это может только тот, кто знает получателя.
 */
export function declineFullNameChecked(
  fullName: string,
  grammaticalCase: GrammaticalCase,
): DeclensionCheck {
  const source = fullName.trim().replace(/\s+/g, ' ');
  // Пустое ФИО — это незаполненная колонка, а не сомнение в склонении.
  // Про неё отчёт проверки скажет отдельно и понятнее, чем мы отсюда.
  if (!source) return { value: fullName, confidence: 'high', doubts: [] };

  // Латиница, цифры, иероглифы — не наш случай. Английское имя, пропущенное
  // через русские правила, превращается в бессмыслицу.
  if (!CYRILLIC_NAME.test(source)) return unsure(source, 'not-cyrillic');

  const tokens = source.split(' ');
  // Больше трёх слов — двойные фамилии, «оглы», приставки. Разобрать
  // их надёжно нельзя, а испортить — легко.
  if (tokens.length > 3) return unsure(source, 'too-many-words');

  const parts = splitParts(tokens);
  if (!parts) return unsure(source, 'unrecognized');

  const gender = detectGender(parts);

  const doubts: DeclensionDoubt[] = [];
  if (gender === 'androgynous') doubts.push('unknown-gender');
  if (parts.last) {
    if (FOREIGN_SURNAME.test(parts.last)) doubts.push('foreign-surname');
    if (isIndeclinableSurname(parts.last, gender)) doubts.push('indeclinable-surname');
  }

  try {
    const declined = petrovich({ ...parts, gender }, grammaticalCase) as Parts;
    // Собираем в том же порядке, в каком человек написал: если он привык
    // к «Фамилия Имя Отчество», менять порядок мы не вправе.
    const value = tokens
      .map((token) => {
        if (token === parts.last) return declined.last ?? token;
        if (token === parts.first) return declined.first ?? token;
        if (token === parts.middle) return declined.middle ?? token;
        return token;
      })
      .join(' ');
    return { value, confidence: declensionConfidence(doubts), doubts };
  } catch {
    // Правила не сошлись — отдаём как было. Молча падать из-за одной
    // строки в списке на триста человек несоразмерно, но в отчёт
    // проверки такая строка обязана попасть.
    const failed: DeclensionDoubt[] = [...doubts, 'petrovich-failed'];
    return { value: source, confidence: declensionConfidence(failed), doubts: failed };
  }
}

function unsure(value: string, doubt: DeclensionDoubt): DeclensionCheck {
  return { value, confidence: declensionConfidence([doubt]), doubts: [doubt] };
}

/**
 * Фамилии, не изменяющиеся ни у мужчин, ни у женщин: «Коваленко»,
 * «Белых», «Дурново», «Гюго». Оканчивающиеся на «а» и «я» сюда не входят —
 * «Глинка», «Сковорода» склоняются как обычные слова.
 */
const NEVER_DECLINED_SURNAME = /(ко|их|ых|аго|яго|ово|[еиоуэю])$/i;

/** Согласные, на которые оканчивается несклоняемая у женщин фамилия. */
const CONSONANT_END = /[бвгджзйклмнпрстфхцчшщъь]$/i;

/**
 * Фамилии нерусские по форме. Склоняются по своим правилам, и petrovich
 * угадывает их хуже, чем русские: «Петросяну» верно, а «Тер-Петросяну»
 * уже спорно. Значение отдаём, но помечаем.
 */
const FOREIGN_SURNAME = /(швили|дзе|ян|янц|оглы|кызы|уулы|ук|юк)$/i;

function isIndeclinableSurname(last: string, gender: 'male' | 'female' | 'androgynous'): boolean {
  if (NEVER_DECLINED_SURNAME.test(last)) return true;
  // У женщин не изменяется фамилия на согласную: «Ким Ольге»,
  // «Гончарук Дарье». Это правило языка, а не наш пропуск, — но
  // человеку показать стоит: чаще всего здесь ошибка в поле пола.
  return gender === 'female' && CONSONANT_END.test(last);
}

/**
 * Раскладывает слова по ролям.
 *
 * Отчество узнаётся по окончанию надёжно. Фамилию от имени отличаем
 * по приметам, а если примет нет — считаем фамилией первое слово:
 * в списках участников, протоколах и приказах пишут «Фамилия Имя»,
 * и это соглашение сильнее наших догадок.
 */
function splitParts(tokens: string[]): Parts | null {
  // Сокращения «П.И.» склонять нечего и незачем: они и так не изменяются.
  if (tokens.some((t) => t.includes('.') && t.length <= 4)) {
    const full = tokens.filter((t) => !t.includes('.'));
    if (full.length !== 1) return null;
    return SURNAME.test(full[0]) ? { last: full[0] } : { first: full[0] };
  }

  const middle = tokens.find((t) => PATRONYMIC.test(t));
  const rest = tokens.filter((t) => t !== middle);

  if (rest.length === 0) return middle ? { middle } : null;

  if (rest.length === 1) {
    const single = rest[0];
    // Одно слово рядом с отчеством — это имя: «Пётр Ильич».
    if (middle) return { first: single, middle };
    return SURNAME.test(single) ? { last: single } : { first: single };
  }

  const [a, b] = rest;
  // Приметы фамилии у первого слова — значит «Фамилия Имя».
  if (SURNAME.test(a) && !SURNAME.test(b)) return { last: a, first: b, middle };
  // Приметы у второго — значит «Имя Фамилия».
  if (SURNAME.test(b) && !SURNAME.test(a)) return { first: a, last: b, middle };
  // Примет нет или они у обоих — держимся соглашения списков.
  return { last: a, first: b, middle };
}

const FEMALE_SURNAME = /(ова|ева|ёва|ина|ына|ская|цкая|ая|яя)$/i;
const MALE_SURNAME = /(ов|ев|ёв|ин|ын|ский|цкий|ской|цкой)$/i;

/**
 * Мужские имена, оканчивающиеся на «а» или «я», — то есть выглядящие
 * по общему правилу женскими. Полные и самые ходовые сокращения:
 * в списках участников соревнований пишут и «Иванов Дима».
 */
const MALE_NAMES_IN_VOWEL = new Set(
  (
    'никита илья фома кузьма лука данила гаврила савва сила фока ' +
    'дима вова коля толя витя петя ваня миша гриша леша сережа ' +
    'юра боря сева степа костя вася гоша тема рома'
  ).split(' '),
);

/**
 * Имена, которые носят и мужчины, и женщины. Здесь мы не угадываем:
 * «Саше» и «Саше» совпадают в дательном, а вот фамилия разойдётся —
 * «Иванову Саше» против «Ивановой Саше». Поэтому без других подсказок
 * такое имя оставляет пол неизвестным.
 */
const AMBIGUOUS_NAMES = new Set('саша женя валя слава ника мика'.split(' '));

/**
 * Пол — от него зависит всё: «Иванову» против «Ивановой».
 *
 * Спрашиваем по убыванию надёжности: отчество, фамилия, имя. Отчество
 * отвечает почти без ошибок; фамилия с русским суффиксом — тоже; имя
 * хуже всех, потому что Никита и Илья оканчиваются как женские,
 * а Саша и Женя не оканчиваются никак определённо.
 *
 * Неизвестный пол — не беда: petrovich тогда вернёт имя нетронутым,
 * а это наш способ отступить, не испортив.
 */
export function detectGender(parts: Parts): 'male' | 'female' | 'androgynous' {
  // petrovich.detect_gender рассчитан именно на отчество: имени он
  // не знает, и спрашивать его об имени бесполезно.
  const byMiddle = parts.middle ? petrovich.detect_gender(parts.middle) : null;
  if (byMiddle && byMiddle !== 'androgynous') return byMiddle;

  if (parts.last) {
    if (FEMALE_SURNAME.test(parts.last)) return 'female';
    if (MALE_SURNAME.test(parts.last)) return 'male';
  }

  if (parts.first) {
    // Списки держим без «ё»: пишут и «Лёша», и «Леша», а различать их
    // здесь незачем.
    const name = parts.first.toLowerCase().replace(/ё/g, 'е');
    if (AMBIGUOUS_NAMES.has(name)) return 'androgynous';
    if (MALE_NAMES_IN_VOWEL.has(name)) return 'male';
    if (/[ая]$/i.test(parts.first)) return 'female';
    // Любовь — единственное ходовое женское имя на мягкий знак, остальные
    // такие (Игорь) мужские.
    if (name === 'любовь') return 'female';
    return 'male';
  }

  return 'androgynous';
}

/**
 * Неразрывный пробел. Обычный разрешает перенос ровно там, где он
 * недопустим: «Иванов И.» остаётся в строке, а вторая «И.» уезжает
 * на следующую — и подпись под грамотой разваливается пополам.
 */
const NBSP = '\u00A0';

/**
 * Короткая форма: «Иванов И. И.».
 *
 * Нужна там, где полное ФИО не помещается: подпись под линией, корешок,
 * узкая колонка протокола. Порядок здесь всегда «фамилия, потом
 * инициалы» — в этом и смысл сокращения, поэтому «Мария Петрова»
 * становится «Петрова М.», а не наоборот.
 *
 * Правило файла действует и тут: не разобрали — вернули как было.
 */
export function shortName(fullName: string): string {
  const source = fullName.trim().replace(/\s+/g, ' ');
  if (!source) return fullName;
  if (!CYRILLIC_NAME.test(source)) return source;

  const tokens = source.split(' ');
  if (tokens.length > 3) return source;

  // Уже сокращённое ФИО — «Иванов П.И.», «Иванов П. И.». Пересобираем
  // ради тех самых неразрывных пробелов: человек их не ставит.
  const dotted = tokens.filter((t) => t.includes('.'));
  if (dotted.length > 0) {
    const plain = tokens.filter((t) => !t.includes('.'));
    if (plain.length !== 1) return source;
    const letters = dotted.join('').match(/[А-ЯЁа-яё]/g);
    if (!letters) return source;
    return [plain[0], ...letters.map((l) => `${l.toUpperCase()}.`)].join(NBSP);
  }

  const parts = splitParts(tokens);
  // Без фамилии сокращать нечего: «Пётр» короче любых инициалов.
  if (!parts?.last) return source;

  const initials = [parts.first, parts.middle]
    .filter((part): part is string => Boolean(part))
    .map((part) => `${part[0].toUpperCase()}.`);

  if (initials.length === 0) return parts.last;
  return [parts.last, ...initials].join(NBSP);
}

/**
 * Пол по строке ФИО — та же `detectGender`, только с разбором строки.
 *
 * Нужна парным формам («награждён(а)»), и это обёртка, а не второе
 * определение пола: два расходящихся правила дали бы на одной грамоте
 * «Иванову Марии» рядом с «награждён», и виноватого было бы не найти.
 */
export function detectGenderFromName(fullName: string): 'male' | 'female' | 'androgynous' {
  const source = fullName.trim().replace(/\s+/g, ' ');
  if (!source || !CYRILLIC_NAME.test(source)) return 'androgynous';

  const tokens = source.split(' ');
  if (tokens.length > 3) return 'androgynous';

  const parts = splitParts(tokens);
  return parts ? detectGender(parts) : 'androgynous';
}
