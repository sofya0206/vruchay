/**
 * Служебные переменные — те, что подставляет сам сервис.
 *
 * Колонки таблицы получателей организация заводит сама, а это — то, что
 * она физически не может внести руками: дата выпуска, проверочный код
 * экземпляра, порядковый номер. Без них организатору приходится либо
 * дописывать дату в макет каждый раз заново, либо заводить колонку
 * с одинаковым значением во всех строках.
 */

import { declineFullName, shortName } from './declension';
import { numberInWordsWith } from './number-in-words';
import { fullNameOf } from './paired-forms';
import { placeWord } from './place-word';
import { transliterateGost, transliterateIcao } from './translit';

/** Служебная переменная: как называется, что подставляет, как объяснить. */
export interface SystemVariable {
  name: string;
  title: string;
  hint: string;
}

export const SYSTEM_VARIABLES: SystemVariable[] = [
  { name: 'date', title: 'Дата выдачи', hint: '04.08.2026' },
  /*
   * Та же дата в других записях — отдельными полями, а не настройкой
   * формата у поля: так же устроены падежи имени, и человек выбирает
   * запись глазами из списка, а не из выпадающего меню внутри фишки.
   */
  { name: 'date_long', title: 'Дата выдачи словами', hint: '4 августа 2026 г.' },
  { name: 'date_iso', title: 'Дата выдачи цифрами (ISO)', hint: '2026-08-04' },
  { name: 'date_en', title: 'Дата выдачи по-английски', hint: '4 August 2026' },
  { name: 'year', title: 'Год выдачи', hint: '2026' },
  { name: 'number', title: 'Номер по списку', hint: '1, 2, 3…' },
  { name: 'total', title: 'Всего в списке', hint: 'для «3 из 120»' },
  { name: 'reg_number', title: 'Регистрационный номер', hint: '142/2026 — сквозной за год' },
  { name: 'code', title: 'Проверочный код', hint: 'для сверки с QR' },
  { name: 'org', title: 'Название организации', hint: 'из настроек кабинета' },

  /*
   * Мероприятие. Заполняется один раз на весь документ, а не колонкой
   * в таблице: у соревнования одно название и одни даты на всех
   * трёхсот участников, и держать их в трёхстах одинаковых ячейках —
   * значит триста раз дать возможность опечататься.
   */
  { name: 'event', title: 'Название мероприятия', hint: 'первенство области по плаванию' },
  { name: 'event_date', title: 'Даты мероприятия', hint: '17–19 июня 2026 года' },
  { name: 'event_place', title: 'Место проведения', hint: 'г. Челябинск' },
  { name: 'hours', title: 'Объём часов', hint: 'для сертификатов об обучении' },

  /*
   * Производные от колонки «name». Считаются сервисом, но перекрываются
   * одноимённой колонкой: организатор, вписавший падеж руками, сделал
   * это именно потому, что наша догадка его не устроила.
   */
  {
    name: 'name_dat',
    title: 'ФИО в дательном падеже',
    hint: 'Награждается Иванову Петру',
  },
  {
    name: 'name_gen',
    title: 'ФИО в родительном падеже',
    hint: 'Работа Иванова Петра',
  },
  {
    name: 'name_short',
    title: 'ФИО сокращённо',
    hint: 'Иванов П. И.',
  },
  /*
   * Латиница. Два стандарта, а не один: ГОСТ 7.79-2000 (система Б) —
   * делопроизводственный, ICAO Doc 9303 — тот, по которому имя написано
   * в загранпаспорте. Зарубежная сторона сверяет диплом именно с ним,
   * поэтому выбор стандарта виден прямо в имени переменной: подставить
   * не то — значит выдать документ, который не сойдётся с паспортом.
   */
  {
    name: 'name_lat_gost',
    title: 'ФИО латиницей (ГОСТ 7.79-2000)',
    hint: 'Shhukin Yurij',
  },
  {
    name: 'name_lat_icao',
    title: 'ФИО латиницей (ICAO, как в загранпаспорте)',
    hint: 'Shchukin Iurii',
  },
  {
    name: 'place_word',
    title: 'Место словом',
    hint: 'первое, второе — из колонки «Место»',
  },
  {
    name: 'hours_word',
    title: 'Объём часов прописью',
    hint: 'сто двадцать часов — из «Объёма часов»',
  },
];

export const SYSTEM_VARIABLE_NAMES = SYSTEM_VARIABLES.map((v) => v.name);

/** Что известно о конкретном выпускаемом экземпляре. */
export interface SystemVariableContext {
  /** Момент выпуска. Передаётся снаружи: в отрисовке нет своих часов. */
  issuedAt: Date;
  /** Порядковый номер строки в таблице, считая с единицы. */
  number?: number;
  /** Сколько всего строк в списке — для «3 из 120». */
  total?: number;
  /** Публичный идентификатор экземпляра — он же в QR. */
  publicId?: string | null;
  /** Регистрационный номер экземпляра: «142/2026». До выпуска его нет. */
  regNumber?: string | null;
  /** Название организации-издателя. */
  orgName?: string;
  /** Мероприятие: одно на весь документ, заполняется в свойствах материала. */
  event?: EventFields;
}

/**
 * Сведения о мероприятии.
 *
 * Даты — строки, а не даты. Организаторы пишут их живым языком:
 * «17 июня 2026 года», «17–19 июня 2026», «сезон 2025/26», «март — май».
 * Календарное поле заставило бы выбрать один день там, где его нет,
 * и всё равно не смогло бы напечатать то, что человеку нужно.
 */
export interface EventFields {
  name?: string;
  date?: string;
  place?: string;
  hours?: string;
}

/**
 * Значения служебных переменных.
 *
 * Время приводим к московскому: организация в Челябинске выпускает
 * документ ночью, сервер стоит в другом часовом поясе — без явной зоны
 * на грамоте оказалась бы вчерашняя дата. Москва выбрана как общая
 * точка отсчёта для российской отчётности.
 */
export function systemVariables(ctx: SystemVariableContext): Record<string, string> {
  const date = new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Europe/Moscow',
  }).format(ctx.issuedAt);

  return {
    date,
    date_long: `${new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Moscow' }).format(ctx.issuedAt)}`,
    date_iso: new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Moscow' }).format(ctx.issuedAt),
    date_en: new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Moscow' }).format(ctx.issuedAt),
    year: date.slice(-4),
    number: ctx.number === undefined ? '' : String(ctx.number),
    total: ctx.total === undefined ? '' : String(ctx.total),
    reg_number: ctx.regNumber ?? '',
    code: ctx.publicId ?? '',
    org: ctx.orgName ?? '',
    event: ctx.event?.name ?? '',
    event_date: ctx.event?.date ?? '',
    event_place: ctx.event?.place ?? '',
    hours: ctx.event?.hours ?? '',
  };
}

/**
 * Данные для подстановки: служебные переменные плюс колонки получателя.
 *
 * Колонка организации перекрывает служебную переменную того же имени.
 * Так и должно быть: если организатор завёл колонку «date» и заполнил её
 * руками, он имел в виду именно её, а не нашу дату выпуска. Обратный
 * порядок молча подменял бы его данные нашими.
 */
export function mergeVariables(
  rowData: Record<string, string>,
  ctx: SystemVariableContext,
): Record<string, string> {
  const merged = { ...systemVariables(ctx), ...rowData };

  /*
   * Место словом. Считается из колонки «место», а своя колонка «place_word»
   * — если организация её завела — сильнее: значит, там написали руками
   * что-то своё, вроде «Гран-при».
   */
  if (merged.place_word === undefined && merged.place) {
    merged.place_word = placeWord(merged.place);
  }

  /*
   * Объём часов прописью: «в объёме сто двадцать часов». На сертификатах
   * об обучении число принято дублировать словом — так его нельзя
   * подправить ручкой после выдачи.
   *
   * Считаем только с чистого числа. Организаторы пишут в это поле и
   * «16 академических часов», и «72 ч.»: разобрать такое надёжно нельзя,
   * а испортить — легко, поэтому всё, кроме числа, отдаём как есть.
   * Правило то же, что у `placeWord`.
   */
  if (merged.hours_word === undefined && merged.hours) {
    merged.hours_word = hoursWord(merged.hours);
  }

  /*
   * Склонение считаем после слияния: имя приходит колонкой получателя,
   * и до слияния его ещё нет. Своя колонка «name_dat» опять же сильнее
   * нашей догадки — организатор мог вписать падеж руками именно потому,
   * что автоматическое склонение его не устроило.
   *
   * ФИО собираем через `fullNameOf`: импорт умеет раскладывать шапку
   * на «Фамилия», «Имя», «Отчество», и тогда колонки «name» просто нет.
   * Без этого пол по отчеству определялся бы, а само имя на грамоте
   * оставалось пустым — расхождение заметнее любой из двух ошибок.
   */
  const fullName = fullNameOf(merged);

  if (merged.name_dat === undefined) {
    merged.name_dat = declineFullName(fullName, 'dative');
  }

  if (merged.name_gen === undefined) {
    merged.name_gen = declineFullName(fullName, 'genitive');
  }

  if (merged.name_short === undefined) {
    merged.name_short = shortName(fullName);
  }

  /*
   * Латиница — та же логика: считаем сами, но своя колонка сильнее.
   * Здесь она перекрывает особенно часто: у человека может быть уже
   * выданный загранпаспорт с написанием, отличным от нынешней таблицы
   * ICAO (её меняли), и на дипломе должно стоять то, что в паспорте.
   */
  if (merged.name_lat_gost === undefined) {
    merged.name_lat_gost = transliterateGost(fullName);
  }

  if (merged.name_lat_icao === undefined) {
    merged.name_lat_icao = transliterateIcao(fullName);
  }

  return merged;
}

/** «120» → «сто двадцать часов». Всё, что не голое число, — как есть. */
function hoursWord(hours: string): string {
  const source = hours.trim();
  if (!/^\d{1,6}$/.test(source)) return source;
  return numberInWordsWith(Number(source), 'час', 'часа', 'часов');
}

/**
 * Момент выдачи для подстановки: дата выдачи материала, если задана,
 * иначе — сейчас.
 *
 * Дата хранится днём без времени; берём полдень по Москве, чтобы
 * ни один часовой пояс не сдвинул её на соседние сутки при форматировании.
 */
export function issuedAtOf(issueDate: string | Date | null | undefined, now: Date = new Date()): Date {
  if (!issueDate) return now;
  const day = issueDate instanceof Date ? issueDate.toISOString().slice(0, 10) : issueDate.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return now;
  return new Date(`${day}T12:00:00+03:00`);
}

/** Регистрационный номер из счётчика: «142/2026». */
export function formatRegNumber(value: number, year: number): string {
  return `${value}/${year}`;
}
