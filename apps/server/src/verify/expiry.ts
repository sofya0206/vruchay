/**
 * Срок действия документа.
 *
 * Два способа задать его у материала, и нужны оба:
 *
 * - длительность от даты выдачи в записи ISO 8601 — `P1Y` (год), `P6M`
 *   (полгода), `P2Y6M`; так работают сертификаты о повышении квалификации
 *   и допуски, у которых срок считается от каждого документа отдельно;
 * - фиксированная дата — «до 31 декабря 2026»: так работают сезонные
 *   допуски и членские билеты, срок которых один на всех.
 *
 * Если заданы обе, фиксированная дата побеждает: она названа явно.
 */

/** Разобранная длительность. Только календарные единицы — часы документу не нужны. */
export interface IsoDuration {
  years: number;
  months: number;
  weeks: number;
  days: number;
}

/** Не больше века: за пределами — почти наверняка опечатка вроде P1000Y. */
const MAX_YEARS = 100;

const DURATION = /^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)W)?(?:(\d+)D)?$/;

/**
 * Разбор `P1Y`, `P18M`, `P2W`, `P1Y6M`. Возвращает null, если это не
 * длительность или она нулевая: нулевой срок означал бы документ,
 * истёкший в момент выдачи.
 */
export function parseIsoDuration(value: string): IsoDuration | null {
  const match = DURATION.exec(value.trim().toUpperCase());
  if (!match) return null;
  const [, y, m, w, d] = match;
  const duration = {
    years: Number(y ?? 0),
    months: Number(m ?? 0),
    weeks: Number(w ?? 0),
    days: Number(d ?? 0),
  };
  const total = duration.years + duration.months + duration.weeks + duration.days;
  if (total === 0) return null;
  if (duration.years > MAX_YEARS || duration.months > MAX_YEARS * 12) return null;
  return duration;
}

/**
 * Прибавляет длительность к дате.
 *
 * По календарю, а не по секундам: год — это следующий год той же датой,
 * а не 365 дней. 29 февраля плюс год даёт 1 марта — так считает и
 * JavaScript, и большинство людей.
 */
export function addIsoDuration(date: Date, duration: IsoDuration): Date {
  const out = new Date(date.getTime());
  out.setUTCFullYear(out.getUTCFullYear() + duration.years);
  out.setUTCMonth(out.getUTCMonth() + duration.months);
  out.setUTCDate(out.getUTCDate() + duration.weeks * 7 + duration.days);
  return out;
}

/** Настройка срока у материала: одно из двух, либо ничего. */
export interface ExpiryPolicy {
  /** Длительность от выдачи, ISO 8601: `P1Y`. */
  expiresIn: string | null;
  /** Фиксированная дата окончания, одна на все документы материала. */
  expiresAt: Date | null;
}

/**
 * Когда истечёт документ, выпущенный в `issuedAt`. Null — бессрочный.
 *
 * Считается один раз в момент выпуска и записывается в файл: правило
 * у материала могут потом поменять, а срок уже выданного документа
 * от этого меняться не должен — он напечатан на бумаге.
 */
export function expiresAtFor(issuedAt: Date, policy: ExpiryPolicy): Date | null {
  if (policy.expiresAt) return policy.expiresAt;
  if (policy.expiresIn) {
    const duration = parseIsoDuration(policy.expiresIn);
    if (duration) return addIsoDuration(issuedAt, duration);
  }
  return null;
}
