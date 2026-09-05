import { PLAN_FEATURE_KEYS, type PlanFeature, type PlanPeriod } from '@gramota/shared';

/*
 * План как данные.
 *
 * Здесь нет ни одного `if (plan === 'pro')` и не должно появиться: код
 * спрашивает у плана, что разрешено и сколько осталось. Иначе смена условий
 * одному клиенту означала бы правку кода и релиз — на каждый разговор
 * о цене.
 *
 * Всё в этом файле — чистые функции без базы: арифметика остатка и решение
 * «пускать или нет» стоят денег в обе стороны, и проверять их надо на каждый
 * прогон тестов, а не раз в релиз на живой базе.
 */

/** План в том объёме, которого хватает, чтобы посчитать остаток. */
export interface PlanRecord {
  id: string;
  name: string;
  documentLimit: number;
  period: PlanPeriod;
  startsAt: Date;
  endsAt: Date | null;
  features: string[];
  neverExpires: boolean;
}

/**
 * Откуда взялись условия.
 *
 * `trial` — бесплатная проба, `plan` — назначенный план, `legacy-paid` —
 * организация, переведённая на оплаченный тариф до появления планов:
 * ограничений у неё не было, и отнимать их задним числом мы не станем.
 */
export type PlanSource = 'trial' | 'plan' | 'legacy-paid';

/**
 * Насколько близко к концу.
 *
 * Предупреждаем на двадцати и на десяти процентах остатка: узнать
 * о конце квоты в день награждения — значит узнать поздно.
 */
export type WarnLevel = 'none' | 'low' | 'critical' | 'exhausted' | 'expired';

/** Что можно ответить на вопрос «сколько мне ещё положено». */
export interface Quota {
  source: PlanSource;
  planId: string | null;
  /** Как называть условия человеку. */
  name: string;
  /** Предел за период. null — предела нет. */
  limit: number | null;
  used: number;
  /** Остаток. null — считать нечего, предела нет. */
  left: number | null;
  startsAt: Date | null;
  endsAt: Date | null;
  period: PlanPeriod | null;
  neverExpires: boolean;
  /** Срок вышел: новый выпуск не начинается, выданное остаётся живым. */
  expired: boolean;
  /** Что разрешено. null — разрешено всё (проба и старый оплаченный тариф). */
  features: PlanFeature[] | null;
  /** Сколько добавили приглашения друзей. Только для пробы. */
  bonus: number;
  warn: WarnLevel;
}

/**
 * Сгорел ли план.
 *
 * «Пакет не сгорает» — отдельный признак, а не догадка по периоду: год
 * с непогашенным остатком тоже иногда продлевают именно так, и решать
 * это должен тот, кто договаривался, а не код.
 */
export function isExpired(plan: PlanRecord, now: Date): boolean {
  if (plan.neverExpires) return false;
  return plan.endsAt !== null && now.getTime() > plan.endsAt.getTime();
}

/**
 * Действующий план из всех, что были у организации.
 *
 * Планы не удаляются: по ним видно, что и когда было обещано. Поэтому
 * выбираем — берём последний начавшийся из неистёкших, а если истекли
 * все, последний истёкший. Второе важнее, чем кажется: организация
 * с кончившимся планом не должна молча проваливаться обратно
 * на бесплатную пробу и получать полсотни документов сверх договора.
 */
export function pickPlan(plans: PlanRecord[], now: Date): PlanRecord | null {
  const started = plans
    .filter((p) => p.startsAt.getTime() <= now.getTime())
    .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime());
  if (started.length === 0) return null;
  return started.find((p) => !isExpired(p, now)) ?? started[0];
}

/** Насколько близко к концу — по остатку, а не по израсходованному. */
export function warnLevel(limit: number | null, left: number | null, expired = false): WarnLevel {
  if (expired) return 'expired';
  if (limit === null || left === null) return 'none';
  if (left <= 0) return 'exhausted';
  if (left <= limit * 0.1) return 'critical';
  if (left <= limit * 0.2) return 'low';
  return 'none';
}

/** Условия по назначенному плану. */
export function planQuota(plan: PlanRecord, used: number, now: Date): Quota {
  const expired = isExpired(plan, now);
  const left = Math.max(0, plan.documentLimit - used);
  return {
    source: 'plan',
    planId: plan.id,
    name: plan.name,
    limit: plan.documentLimit,
    used,
    left,
    startsAt: plan.startsAt,
    endsAt: plan.endsAt,
    period: plan.period,
    neverExpires: plan.neverExpires,
    expired,
    features: plan.features.filter((f): f is PlanFeature =>
      (PLAN_FEATURE_KEYS as string[]).includes(f),
    ),
    bonus: 0,
    warn: warnLevel(plan.documentLimit, left, expired),
  };
}

/** Бесплатная проба: предел из настроек плюс заработанное приглашениями. */
export function trialQuota(base: number, bonus: number, used: number): Quota {
  const limit = base + bonus;
  const left = Math.max(0, limit - used);
  return {
    source: 'trial',
    planId: null,
    name: 'Бесплатная проба',
    limit,
    used,
    left,
    startsAt: null,
    endsAt: null,
    period: null,
    neverExpires: false,
    expired: false,
    features: null,
    bonus,
    warn: warnLevel(limit, left),
  };
}

/**
 * Организация с оплаченным тарифом из времён до планов.
 *
 * Ограничений у неё не было. Назначать их задним числом нельзя: человек
 * платил за другое, и первым, что он увидит, будет отказ посреди
 * награждения.
 */
export function legacyPaidQuota(used: number): Quota {
  return {
    source: 'legacy-paid',
    planId: null,
    name: 'Оплаченный тариф',
    limit: null,
    used,
    left: null,
    startsAt: null,
    endsAt: null,
    period: null,
    neverExpires: false,
    expired: false,
    features: null,
    bonus: 0,
    warn: 'none',
  };
}

/** Разрешает ли квота эту возможность. */
export function allows(quota: Quota, feature: PlanFeature): boolean {
  // Срок кончился — остаётся только то, что уже выдано: рассылать
  // и принимать заявки по истёкшему плану не за что.
  if (quota.expired) return false;
  // null — план возможности не перечисляет (проба и старый тариф):
  // отнимать у них то, что работало, мы не будем.
  if (quota.features === null) return true;
  return quota.features.includes(feature);
}

/**
 * Что делать дальше — одинаково во всех отказах по квоте.
 *
 * Без ссылки на кнопку, которой ещё нет: форма «Обсудить условия» делается
 * отдельно, а обещать несуществующий раздел хуже, чем сказать словами.
 */
const NEXT_STEP = 'Напишите нам — обсудим условия и добавим документов.';

/** Дата по-русски. Без Intl: набор локалей в образе — не то, на что стоит опираться. */
function ruDate(date: Date): string {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}.${date.getFullYear()}`;
}

/**
 * Отказ словами: сколько осталось, сколько просят и что делать дальше.
 *
 * Тупика в тексте быть не должно. «Лимит исчерпан» без продолжения — это
 * человек с готовым списком участников, которому некуда нажать; он
 * не заплатит, он уйдёт.
 */
export function refusal({
  quota,
  adding,
  reserved,
}: {
  quota: Quota;
  adding: number;
  reserved: number;
}): string {
  // Про бронь говорим отдельно: «выпущено 45 из 50» при пустом списке
  // файлов выглядит ошибкой сервиса, а не занятым местом.
  const held = reserved > 0 ? ` (из них ${reserved} держит незаконченный выпуск)` : '';
  const limit = quota.limit ?? 0;
  const used = quota.used + reserved;
  const left = Math.max(0, limit - used);

  if (quota.expired) {
    const until = quota.endsAt ? ` ${ruDate(quota.endsAt)}` : '';
    return (
      `Срок плана «${quota.name}» закончился${until}, новый выпуск не начнётся. ` +
      `Уже выданные документы остаются действительными и проверяются по QR-коду. ` +
      NEXT_STEP
    );
  }

  if (quota.source === 'trial') {
    // Про приглашения говорим только тем, у кого проба на исходе: раньше
    // это выглядело бы навязыванием, а здесь это ответ на их вопрос
    // «что делать дальше».
    const hint =
      ` Или пригласите коллегу в разделе «Пригласить друга» — за каждого, ` +
      `кто начнёт работать, добавим ещё документов.`;
    return left === 0
      ? `Бесплатная проба закончилась: выпущено ${used} документов из ${limit}${held}. ` +
          NEXT_STEP +
          hint
      : `На бесплатной пробе осталось ${left} документов из ${limit}${held}, ` +
          `а отмечено ${adding}. Снимите лишние отметки — или напишите нам, ` +
          `обсудим условия.` +
          hint;
  }

  return left === 0
    ? `План «${quota.name}» израсходован: выпущено ${used} документов из ${limit}${held}. ` +
        `Уже начатый выпуск дойдёт до конца, а новый не начнётся. ` +
        NEXT_STEP
    : `По плану «${quota.name}» осталось ${left} документов из ${limit}${held}, ` +
        `а отмечено ${adding}. Снимите лишние отметки — или напишите нам, ` +
        `обсудим условия.`;
}
