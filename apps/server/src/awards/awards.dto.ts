import { z } from 'zod';
import { awardCondition, awardOutput, awardFieldName } from '@gramota/shared';

/**
 * Приём набора правил.
 *
 * Условия и выходы валидируются схемами из @gramota/shared — теми же,
 * по которым их собирает конструктор в браузере и читает движок. Своя
 * копия схемы на сервере рано или поздно разошлась бы с общей, и правило,
 * собранное в кабинете, перестало бы сохраняться без внятной причины.
 */

/** Название колонки или пусто — «колонка не выбрана». */
const optionalColumn = z.union([z.literal(''), awardFieldName]).default('');

export const ruleInputSchema = z.object({
  /**
   * Идентификатор правила приходит с клиента: конструктор заводит правило
   * до сохранения и должен уметь на него ссылаться. Сервер всё равно
   * пересоздаёт правила набора целиком, поэтому подделать чужое правило
   * этим нельзя — идентификатор живёт только внутри своего набора.
   */
  id: z.string().uuid(),
  enabled: z.boolean().default(true),
  label: z.string().trim().max(120).default(''),
  match: z.enum(['all', 'any']).default('all'),
  conditions: z.array(awardCondition).max(20),
  action: z.enum(['issue', 'skip']).default('issue'),
  outputs: z.array(awardOutput).max(10).default([]),
});
export type RuleInputDto = z.infer<typeof ruleInputSchema>;

export const createRuleSetSchema = z.object({
  name: z.string().trim().min(1, 'Введите название набора').max(200),
  groupColumn: optionalColumn,
  statusColumn: optionalColumn,
  isDefault: z.boolean().default(false),
  /**
   * Правила приходят списком целиком, а порядок берётся из порядка
   * в массиве: он и есть приоритет, и передавать его отдельным полем
   * значило бы дать двум источникам правды разойтись.
   */
  rules: z.array(ruleInputSchema).max(50).default([]),
});
export type CreateRuleSetDto = z.infer<typeof createRuleSetSchema>;

export const updateRuleSetSchema = createRuleSetSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Нечего обновлять');
export type UpdateRuleSetDto = z.infer<typeof updateRuleSetSchema>;

/** Привязка набора к соревнованию. null — отвязать. */
export const attachRuleSetSchema = z.object({
  ruleSetId: z.string().uuid().nullable(),
});
export type AttachRuleSetDto = z.infer<typeof attachRuleSetSchema>;

/**
 * Превью можно посчитать и по несохранённому набору: человек правит
 * правила и сразу видит раскладку. Пусто — берём набор, привязанный
 * к документу.
 */
export const previewSchema = z.object({
  ruleSet: createRuleSetSchema.optional(),
});
export type PreviewDto = z.infer<typeof previewSchema>;

/** Заготовка правил по колонкам уже загруженной таблицы. */
export const suggestSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
});
export type SuggestDto = z.infer<typeof suggestSchema>;
