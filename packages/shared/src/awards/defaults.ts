import { NO_AWARD_STATUSES } from './status';
import type { AwardRule } from './rules';

/**
 * Заготовка набора правил для протокола соревнований.
 *
 * Новый набор создаётся не пустым: за первые пять минут в конструкторе
 * человек всё равно соберёт ровно это — снятых не награждаем, призёров
 * по местам, остальным грамоту участника. Пустой список означал бы, что
 * первое же превью показывает «без правила — 214 строк», и разбираться
 * в устройстве конструктора приходится на испуге.
 *
 * Шаблоны в заготовке не проставлены: какие бланки у федерации, мы не
 * знаем. Правила без шаблона конструктор помечает как незаконченные.
 */

export interface DefaultRulesOptions {
  /** Колонка с местом. Пусто — правила по местам в заготовку не попадут. */
  placeColumn: string;
  /** Колонка со статусом. Пусто — правило про снятых не нужно. */
  statusColumn: string;
  /** Как выдавать идентификаторы правилам: снаружи, чтобы не тянуть crypto. */
  makeId: () => string;
}

export function defaultProtocolRules(options: DefaultRulesOptions): AwardRule[] {
  const { placeColumn, statusColumn, makeId } = options;
  const rules: AwardRule[] = [];

  /*
   * Снятые — первым правилом. Порядок здесь не косметика: выигрывает
   * первое совпавшее, и если правило про места окажется выше,
   * дисквалифицированный с последним временем получит грамоту участника.
   */
  if (statusColumn) {
    rules.push({
      id: makeId(),
      position: rules.length,
      enabled: true,
      label: 'Снятые и не стартовавшие',
      match: 'any',
      conditions: [{ field: statusColumn, op: 'statusIn', value: [...NO_AWARD_STATUSES] }],
      action: 'skip',
      outputs: [],
    });
  }

  if (placeColumn) {
    rules.push({
      id: makeId(),
      position: rules.length,
      enabled: true,
      label: 'Победители',
      match: 'all',
      conditions: [{ field: placeColumn, op: 'placeEquals', value: 1, withinGroup: false }],
      action: 'issue',
      outputs: [],
    });
    rules.push({
      id: makeId(),
      position: rules.length,
      enabled: true,
      label: 'Призёры',
      match: 'all',
      conditions: [
        { field: placeColumn, op: 'placeBetween', value: { from: 2, to: 3 }, withinGroup: false },
      ],
      action: 'issue',
      outputs: [],
    });
  }

  // «Иначе» — последним, без условий. Без него строки без места молча
  // остались бы ни с чем, а превью показало бы их как ошибку.
  rules.push({
    id: makeId(),
    position: rules.length,
    enabled: true,
    label: 'Все остальные участники',
    match: 'all',
    conditions: [],
    action: 'issue',
    outputs: [],
  });

  return rules;
}

export const DEFAULT_RULE_SET_NAME = 'Награждение по протоколу';
