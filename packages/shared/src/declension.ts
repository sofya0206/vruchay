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

interface Parts {
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
  const source = fullName.trim().replace(/\s+/g, ' ');
  if (!source) return fullName;

  // Латиница, цифры, иероглифы — не наш случай. Английское имя, пропущенное
  // через русские правила, превращается в бессмыслицу.
  if (!CYRILLIC_NAME.test(source)) return source;

  const tokens = source.split(' ');
  // Больше трёх слов — двойные фамилии, «оглы», приставки. Разобрать
  // их надёжно нельзя, а испортить — легко.
  if (tokens.length > 3) return source;

  const parts = splitParts(tokens);
  if (!parts) return source;

  const gender = detectGender(parts);

  try {
    const declined = petrovich({ ...parts, gender }, grammaticalCase) as Parts;
    // Собираем в том же порядке, в каком человек написал: если он привык
    // к «Фамилия Имя Отчество», менять порядок мы не вправе.
    return tokens
      .map((token) => {
        if (token === parts.last) return declined.last ?? token;
        if (token === parts.first) return declined.first ?? token;
        if (token === parts.middle) return declined.middle ?? token;
        return token;
      })
      .join(' ');
  } catch {
    // Правила не сошлись — отдаём как было. Молча: падать из-за одной
    // строки в списке на триста человек несоразмерно.
    return source;
  }
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
function detectGender(parts: Parts): 'male' | 'female' | 'androgynous' {
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
