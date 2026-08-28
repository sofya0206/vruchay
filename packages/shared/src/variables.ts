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
import { fullNameOf } from './paired-forms';
import { placeWord } from './place-word';

/** Служебная переменная: как называется, что подставляет, как объяснить. */
export interface SystemVariable {
  name: string;
  title: string;
  hint: string;
}

export const SYSTEM_VARIABLES: SystemVariable[] = [
  { name: 'date', title: 'Дата выпуска', hint: '04.08.2026' },
  { name: 'year', title: 'Год выпуска', hint: '2026' },
  { name: 'number', title: 'Номер по списку', hint: '1, 2, 3…' },
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
   *
   * TODO (отдельной задачей): транслитерация ФИО по ГОСТ Р 52535.1 / ICAO
   * для сертификатов на латинице и числительные прописью («сто двадцать
   * часов»). В этой ветке намеренно не делаем — обе требуют своих таблиц
   * и своего набора проверок.
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
  {
    name: 'place_word',
    title: 'Место словом',
    hint: 'первое, второе — из колонки «Место»',
  },
];

export const SYSTEM_VARIABLE_NAMES = SYSTEM_VARIABLES.map((v) => v.name);

/** Что известно о конкретном выпускаемом экземпляре. */
export interface SystemVariableContext {
  /** Момент выпуска. Передаётся снаружи: в отрисовке нет своих часов. */
  issuedAt: Date;
  /** Порядковый номер строки в таблице, считая с единицы. */
  number?: number;
  /** Публичный идентификатор экземпляра — он же в QR. */
  publicId?: string | null;
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
    year: date.slice(-4),
    number: ctx.number === undefined ? '' : String(ctx.number),
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

  return merged;
}
