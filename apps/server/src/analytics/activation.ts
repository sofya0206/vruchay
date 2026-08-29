import { monthStart } from '../overview/overview.service';

/**
 * Воронка активации и арифметика к ней.
 *
 * Вынесено чистыми функциями, потому что ошибиться здесь можно молча:
 * немонотонная воронка и медиана, посчитанная как среднее, выглядят
 * правдоподобно и никакого сбоя не вызывают — просто на переговорах
 * называется неверная цифра.
 *
 * Считаем только по организациям. Ни одного признака человека — ни
 * идентификатора пользователя, ни адреса, ни устройства — в этих
 * величинах нет и появиться не может: собирая их, мы из обработчика
 * по поручению превратились бы в самостоятельного оператора со всей
 * полнотой ответственности по 152-ФЗ.
 */

/**
 * Шаги активации по порядку. Порядок значим: воронка не может расти,
 * и позднейший пройденный шаг подтверждает все предыдущие.
 */
export const FUNNEL_STEPS = [
  'registered',
  'imported',
  'checked',
  'issued',
  'mailed',
  'returned',
] as const;

export type FunnelStep = (typeof FUNNEL_STEPS)[number];

export const STEP_LABELS: Record<FunnelStep, string> = {
  registered: 'Зарегистрировались',
  imported: 'Загрузили список',
  checked: 'Прошли проверку списка',
  issued: 'Выпустили первый документ',
  mailed: 'Разослали первый пакет',
  returned: 'Вернулись со вторым мероприятием',
};

/**
 * Ориентир по времени до первого выпущенного документа.
 *
 * Десять минут — это не средняя величина, а обещание: человек, пришедший
 * с готовым протоколом, должен успеть получить первую грамоту за один
 * присест. Всё, что дольше, означает, что он ушёл разбираться и, скорее
 * всего, не вернулся.
 */
export const TIME_TO_FIRST_TARGET_MINUTES = 10;

/**
 * Действия, по которым видно, что человек работал с проверкой списка.
 *
 * Точного следа «проверка пройдена» в базе нет: разбор списка ничего
 * не сохраняет, а в журнал попадают только правки по его итогам. Поэтому
 * шаг считается пройденным ещё и по запущенному выпуску — запустить его
 * можно лишь тогда, когда человек счёл список годным. Организация,
 * у которой список оказался чистым с первого раза и которая до выпуска
 * не дошла, в этот шаг не попадёт; ради точной цифры ветке A заказано
 * поле «когда список последний раз проходил проверку» (см. «Что сделано»).
 */
export const CHECK_ACTIONS = ['validation.fix', 'validation.exclude'] as const;

/**
 * Что мы знаем об организации — ровно столько, сколько нужно воронке.
 * Всё остальное (кто именно, с какого адреса) сюда не попадает.
 */
export interface OrgFacts {
  /** В материалах организации есть строки получателей. */
  hasRows: boolean;
  /** Есть след работы с проверкой списка. */
  usedCheck: boolean;
  /** Хотя бы один пакет был поставлен в очередь. */
  startedJob: boolean;
  /** Есть хотя бы один выпущенный документ. */
  hasIssued: boolean;
  /** Хотя бы одно письмо участнику ушло. */
  hasMailed: boolean;
  /**
   * По скольким разным дням приходятся первые выпуски по разным материалам.
   *
   * Именно так отличается второе мероприятие от первого: одно награждение
   * выпускают за один заход, пусть даже двумя материалами — грамотой
   * и дипломом. Возвращение — это новый день и новый материал.
   */
  issueDays: number;
}

export type StepsReached = Record<FunnelStep, boolean>;

/**
 * Какие шаги организация прошла.
 *
 * Результат заведомо невозрастающий: дойдя до выпуска, организация список
 * загружала — даже если строки потом удалили, а материал отправили
 * в корзину. Без этого правила воронка показывала бы «выпустили 30,
 * загрузили список 24», и объяснить такое было бы нечем.
 */
export function stepsReached(facts: OrgFacts): StepsReached {
  const raw: StepsReached = {
    registered: true,
    imported: facts.hasRows,
    checked: facts.usedCheck || facts.startedJob,
    issued: facts.hasIssued,
    mailed: facts.hasMailed,
    returned: facts.issueDays >= 2,
  };

  const deepest = FUNNEL_STEPS.reduce(
    (found, step, index) => (raw[step] ? index : found),
    0,
  );

  return Object.fromEntries(
    FUNNEL_STEPS.map((step, index) => [step, index <= deepest]),
  ) as StepsReached;
}

/** Сколько организаций дошло до каждого шага. */
export function countSteps(all: StepsReached[]): Record<FunnelStep, number> {
  return Object.fromEntries(
    FUNNEL_STEPS.map((step) => [step, all.filter((s) => s[step]).length]),
  ) as Record<FunnelStep, number>;
}

/**
 * Медиана, а не среднее.
 *
 * Одна организация, зарегистрировавшаяся в марте и выпустившая первый
 * документ в августе, сдвигает среднее на месяцы и делает его
 * бессмысленным. Медиана отвечает на вопрос, который задают на самом
 * деле: за сколько справляется обычный человек.
 */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 1
    ? sorted[middle]
    : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

/**
 * Доля от 0 до 1 или null, если делить не на что.
 *
 * Ноль вместо null здесь был бы враньём: «0% пакетов без ошибок»
 * у организации, которая ещё не выпускала, читается как поломка.
 */
export function share(part: number, whole: number): number | null {
  return whole > 0 ? part / whole : null;
}

/** Полных минут между двумя моментами; отрицательных не бывает. */
export function minutesBetween(from: Date, to: Date): number {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 60_000));
}

/**
 * Границы календарного месяца по Москве: [начало; начало следующего).
 *
 * `monthsBack` отсчитывает назад: 0 — текущий месяц, 1 — прошлый.
 * Верхняя граница исключающая — иначе документ, выпущенный ровно
 * в полночь первого числа, попал бы в оба месяца сразу.
 */
export function monthRange(now: Date, monthsBack = 0): { from: Date; to: Date } {
  return {
    from: monthStart(now, -monthsBack),
    to: monthStart(now, -monthsBack + 1),
  };
}

/** Календарный день по Москве в виде «2026-08-28» — чтобы сравнивать дни. */
export function mskDay(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * «август 2026» — для темы письма и заголовка сводки.
 *
 * Без «г.» на конце, которое подставляет ru-RU: заголовок попадает
 * в середину предложения («за август 2026 выпущено…»), и точка
 * сокращения упирается там в точку самого предложения.
 */
export function monthTitle(date: Date): string {
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Moscow',
    month: 'long',
    year: 'numeric',
  })
    .format(date)
    .replace(/\s*г\.$/, '');
}
