/**
 * Что план разрешает и как он отмеряет срок.
 *
 * Список возможностей лежит здесь, а не в базе и не в коде сервера:
 * его читают и сервер (когда проверяет право на действие), и кабинет
 * (когда пишет человеку, что входит в его план). Разъехавшись, эти два
 * списка означали бы кнопку, которая есть на экране и запрещена сервером.
 */

/** Возможность и то, как она называется по-русски. */
export const PLAN_FEATURES = {
  mailing: 'Рассылка писем участникам',
  tilda: 'Приём заявок с сайта',
  api: 'Доступ по API-токену',
  awards: 'Автоматические правила награждения',
} as const;

export type PlanFeature = keyof typeof PLAN_FEATURES;

/** Все возможности списком — для проверок и для формы назначения плана. */
export const PLAN_FEATURE_KEYS = Object.keys(PLAN_FEATURES) as PlanFeature[];

export function isPlanFeature(value: string): value is PlanFeature {
  return Object.prototype.hasOwnProperty.call(PLAN_FEATURES, value);
}

/**
 * Как отмеряется срок плана.
 *
 * Разовый пакет и год различаются не длиной, а тем, что происходит
 * в конце: год кончается датой, пакет — документами.
 */
export const PLAN_PERIODS = {
  package: 'Разовый пакет',
  year: 'Год',
} as const;

export type PlanPeriod = keyof typeof PLAN_PERIODS;

export const PLAN_PERIOD_KEYS = Object.keys(PLAN_PERIODS) as PlanPeriod[];
