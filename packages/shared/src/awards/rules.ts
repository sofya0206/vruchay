import { z } from 'zod';
import { AWARD_STATUSES } from './status';

/**
 * Контракт набора правил награждения.
 *
 * Ровно такой же общий контракт, как макет листа: его читает конструктор
 * в браузере, движок на сервере и превью раскладки. Поэтому любое изменение
 * формата проходит через AWARD_RULES_SCHEMA_VERSION набора — иначе набор,
 * настроенный в прошлом сезоне, однажды применится не так, как его собирали.
 */
export const AWARD_RULES_SCHEMA_VERSION = 1;

/**
 * Имя колонки таблицы получателей. Совпадает с columnName из DTO сервера:
 * это одно и то же множество имён, и правило не должно уметь сослаться
 * на то, чего колонкой быть не может.
 */
export const awardFieldName = z
  .string()
  .trim()
  .min(1, 'Выберите колонку')
  .max(64)
  .regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, 'Некорректное имя колонки');

/** Границы интервала мест: «с 1 по 3». */
const placeNumber = z.number().int().min(1).max(300);

/**
 * Считать место внутри группы, а не брать его из ячейки.
 *
 * Выключено по умолчанию — и это не осторожность, а единственно верное
 * поведение. В обычном протоколе места уже проставлены по группам, и наш
 * пересчёт там не нужен. Он нужен там, где нумерация сквозная на весь файл:
 * тогда «первое место» из ячейки будет ровно одно на восемь возрастных
 * категорий, а победителей должно быть восемь.
 *
 * Включать вслепую нельзя: если в группе выбыл третий и остались места
 * 1, 2, 4, 5, пересчёт сделает четвёртого третьим и выдаст ему диплом
 * призёра, которого он не выигрывал.
 */
const withinGroupFlag = z.boolean().default(false);

/**
 * Условие — плоская тройка «поле, операция, значение», без вложенных
 * скобок и деревьев.
 *
 * Вложенность здесь стоила бы дороже, чем даёт: конструктор пришлось бы
 * рисовать деревом, а организатор соревнований мыслит списком «место 1–3
 * и возрастная группа юноши». Что не выражается списком, выражается
 * вторым правилом ниже по порядку.
 */
export const awardCondition = z.discriminatedUnion('op', [
  z.object({ field: awardFieldName, op: z.literal('equals'), value: z.string().max(200) }),
  z.object({ field: awardFieldName, op: z.literal('notEquals'), value: z.string().max(200) }),
  z.object({
    field: awardFieldName,
    op: z.literal('oneOf'),
    value: z.array(z.string().max(200)).min(1, 'Добавьте хотя бы одно значение').max(50),
  }),
  z.object({ field: awardFieldName, op: z.literal('contains'), value: z.string().min(1).max(200) }),
  z.object({ field: awardFieldName, op: z.literal('filled') }),
  z.object({ field: awardFieldName, op: z.literal('empty') }),
  /** Место равно числу. Делёжка «2-3» считается равной и 2, и 3. */
  z.object({
    field: awardFieldName,
    op: z.literal('placeEquals'),
    value: placeNumber,
    withinGroup: withinGroupFlag,
  }),
  /** Место в интервале включительно. Делёжка засчитывается по пересечению. */
  z.object({
    field: awardFieldName,
    op: z.literal('placeBetween'),
    value: z
      .object({ from: placeNumber, to: placeNumber })
      .refine((v) => v.from <= v.to, 'Начало интервала больше конца'),
    withinGroup: withinGroupFlag,
  }),
  /** Статус из словаря: сравниваются коды, а не написания из файла. */
  z.object({
    field: awardFieldName,
    op: z.literal('statusIn'),
    value: z.array(z.enum(AWARD_STATUSES)).min(1).max(6),
  }),
]);
export type AwardCondition = z.infer<typeof awardCondition>;

export const AWARD_OPS = [
  'equals',
  'notEquals',
  'oneOf',
  'contains',
  'filled',
  'empty',
  'placeEquals',
  'placeBetween',
  'statusIn',
] as const;
export type AwardOp = (typeof AWARD_OPS)[number];

/**
 * Один выпускаемый документ.
 *
 * Правило выдаёт список, а не один документ: за первое место участнику
 * полагается диплом, а его тренеру — благодарность, и это одно решение
 * судейской коллегии, а не два независимых правила. Разнести их по двум
 * правилам нельзя — выигрывает первое совпавшее.
 */
export const awardOutput = z.object({
  /** Документ-шаблон той же организации. Принадлежность проверяет сервер. */
  templateDocumentId: z.string().uuid('Выберите шаблон'),
  /**
   * Кому. Пусто — самому участнику, строка как есть. Иначе имя колонки,
   * из которой берётся получатель: coach, team. По значению этой колонки
   * идёт дедупликация — у одного тренера пять призёров, а благодарность одна.
   */
  subjectColumn: z.union([z.literal(''), awardFieldName]).default(''),
  /** Где искать повторы получателя: во всём протоколе или внутри группы. */
  dedupeScope: z.enum(['all', 'group']).default('all'),
  /** Подпись для превью: «Благодарность тренеру». */
  label: z.string().trim().max(120).default(''),
});
export type AwardOutput = z.infer<typeof awardOutput>;

/**
 * Правило.
 *
 * Порядок задаётся position, а не временем создания: от порядка зависит
 * результат. «2–3 место» обязано проверяться раньше, чем «все остальные»,
 * иначе призёр получит грамоту участника.
 */
export const awardRule = z.object({
  id: z.string().uuid(),
  position: z.number().int().min(0).max(200),
  enabled: z.boolean().default(true),
  /** То, что видно в превью: «Победители», «Призёры», «Участники». */
  label: z.string().trim().max(120).default(''),
  /** Как соединять условия. Пустой список условий — правило «иначе». */
  match: z.enum(['all', 'any']).default('all'),
  conditions: z.array(awardCondition).max(20),
  /** issue — выдать перечисленное; skip — не выдавать ничего и остановиться. */
  action: z.enum(['issue', 'skip']).default('issue'),
  outputs: z.array(awardOutput).max(10).default([]),
});
export type AwardRule = z.infer<typeof awardRule>;

export const awardRuleSet = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1, 'Введите название набора').max(200),
  schemaVersion: z.number().int().min(1).default(AWARD_RULES_SCHEMA_VERSION),
  /**
   * Колонка, по которой строки делятся на группы. Пусто — весь протокол
   * одна группа.
   *
   * Группа определяет три вещи: область дедупликации получателя
   * (`dedupeScope: 'group'`), подпись строки в отчёте и — если у условия
   * по месту взведён `withinGroup` — круг строк, среди которых считается
   * место. Само по себе заполнение этого поля место не пересчитывает:
   * в обычном протоколе места уже расставлены по группам.
   */
  groupColumn: z.union([z.literal(''), awardFieldName]).default(''),
  /** Колонка со статусом. Пусто — статусов в протоколе нет. */
  statusColumn: z.union([z.literal(''), awardFieldName]).default(''),
  rules: z.array(awardRule).max(50),
});
export type AwardRuleSet = z.infer<typeof awardRuleSet>;

/** Правило без условий срабатывает всегда — это и есть «иначе». */
export function isFallbackRule(rule: AwardRule): boolean {
  return rule.conditions.length === 0;
}

/**
 * Проверки, которые Zod выразить не может: они про набор целиком.
 * Возвращает человеческие сообщения, а не коды, — их показывает конструктор
 * прямо под списком правил.
 */
export function lintRuleSet(set: AwardRuleSet): string[] {
  const problems: string[] = [];
  const ordered = [...set.rules].sort((a, b) => a.position - b.position);

  const fallbackAt = ordered.findIndex((r) => r.enabled && isFallbackRule(r));
  if (fallbackAt >= 0 && fallbackAt < ordered.length - 1) {
    problems.push(
      `Правило «${ordered[fallbackAt].label || 'без условий'}» срабатывает всегда, ` +
        'поэтому правила под ним никогда не проверятся. Перенесите его в конец',
    );
  }

  for (const rule of ordered) {
    if (rule.action === 'issue' && rule.outputs.length === 0) {
      problems.push(`У правила «${rule.label || 'без названия'}» не выбран ни один шаблон`);
    }
    for (const output of rule.outputs) {
      if (output.dedupeScope === 'group' && set.groupColumn === '') {
        problems.push(
          `В правиле «${rule.label || 'без названия'}» повторы ищутся внутри группы, ` +
            'но колонка группы не выбрана',
        );
      }
    }
    const usesStatus = rule.conditions.some((c) => c.op === 'statusIn');
    if (usesStatus && set.statusColumn === '') {
      problems.push(
        `Правило «${rule.label || 'без названия'}» проверяет статус, ` +
          'но колонка статуса не выбрана',
      );
    }
    const countsWithinGroup = rule.conditions.some(
      (c) => 'withinGroup' in c && c.withinGroup === true,
    );
    if (countsWithinGroup && set.groupColumn === '') {
      problems.push(
        `Правило «${rule.label || 'без названия'}» считает место внутри группы, ` +
          'но колонка группы не выбрана — место посчитается по всему протоколу',
      );
    }
  }

  return [...new Set(problems)];
}
