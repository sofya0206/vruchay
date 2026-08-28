import type { AwardCondition, AwardOp, AwardStatus } from '@gramota/shared';
import { AWARD_STATUS_TITLES } from '@gramota/shared';

/**
 * Русские названия операций и сборка человеческой фразы для правила.
 *
 * Конструктор обязан читаться как предложение — «Если место с 1 по 3, то
 * диплом призёра». Организатор соревнований не отличает placeBetween
 * от placeEquals и не должен: он думает про места, а не про операции.
 */

export const OP_TITLES: Record<AwardOp, string> = {
  equals: 'равно',
  notEquals: 'не равно',
  oneOf: 'одно из',
  contains: 'содержит',
  filled: 'заполнено',
  empty: 'пусто',
  placeEquals: 'место равно',
  placeBetween: 'место от и до',
  statusIn: 'статус — один из',
};

/** Операции, которые предлагаем для колонки: место и статус — отдельными. */
export const GENERAL_OPS: AwardOp[] = [
  'equals',
  'notEquals',
  'oneOf',
  'contains',
  'filled',
  'empty',
];
export const PLACE_OPS: AwardOp[] = ['placeEquals', 'placeBetween'];
export const STATUS_OPS: AwardOp[] = ['statusIn'];

/** Условие одной фразой — то, что человек читает, не раскрывая правило. */
export function describeCondition(condition: AwardCondition): string {
  switch (condition.op) {
    case 'equals':
      return `${condition.field} = «${condition.value}»`;
    case 'notEquals':
      return `${condition.field} ≠ «${condition.value}»`;
    case 'oneOf':
      return `${condition.field} — одно из: ${condition.value.join(', ')}`;
    case 'contains':
      return `${condition.field} содержит «${condition.value}»`;
    case 'filled':
      return `${condition.field} заполнено`;
    case 'empty':
      return `${condition.field} пусто`;
    case 'placeEquals':
      return `место ${condition.value}${condition.withinGroup ? ' в группе' : ''}`;
    case 'placeBetween':
      return (
        `место с ${condition.value.from} по ${condition.value.to}` +
        (condition.withinGroup ? ' в группе' : '')
      );
    case 'statusIn':
      return `статус: ${condition.value
        .map((s) => AWARD_STATUS_TITLES[s as AwardStatus] ?? s)
        .join(', ')}`;
  }
}

/** Заготовка условия при смене операции: значение подставляем осмысленное. */
export function blankCondition(field: string, op: AwardOp): AwardCondition {
  switch (op) {
    case 'oneOf':
      return { field, op, value: [''] };
    case 'filled':
    case 'empty':
      return { field, op };
    case 'placeEquals':
      return { field, op, value: 1, withinGroup: false };
    case 'placeBetween':
      return { field, op, value: { from: 1, to: 3 }, withinGroup: false };
    case 'statusIn':
      return { field, op, value: ['dsq'] };
    default:
      return { field, op, value: '' };
  }
}
