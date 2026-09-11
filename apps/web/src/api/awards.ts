import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AwardPlan, AwardRuleSet } from '@gramota/shared';
import { api } from './client';

/** Строка списка наборов: то, что видно до открытия конструктора. */
export interface RuleSetSummary {
  id: string;
  name: string;
  groupColumn: string;
  statusColumn: string;
  isDefault: boolean;
  schemaVersion: number;
  updatedAt: string;
  ruleCount: number;
  /** На скольких мероприятиях уже применён. */
  documentCount: number;
}

export interface AwardTemplate {
  id: string;
  title: string;
}

export interface AwardPreview {
  plan: AwardPlan;
  /** Что не так с самим набором, а не со строками протокола. */
  problems: string[];
}

/** Тело запроса на сохранение: сервер берёт порядок правил из порядка массива. */
export interface RuleSetPayload {
  name: string;
  groupColumn: string;
  statusColumn: string;
  isDefault?: boolean;
  rules: AwardRuleSet['rules'];
}

export function useRuleSets() {
  return useQuery({
    queryKey: ['award-rule-sets'],
    queryFn: () => api.get<RuleSetSummary[]>('/award-rules'),
  });
}

export function useRuleSet(ruleSetId: string | null) {
  return useQuery({
    queryKey: ['award-rule-set', ruleSetId],
    queryFn: () => api.get<AwardRuleSet>(`/award-rules/${ruleSetId}`),
    enabled: Boolean(ruleSetId),
  });
}

/** Документы организации, которые можно выбрать шаблоном в правиле. */
export function useAwardTemplates() {
  return useQuery({
    queryKey: ['award-templates'],
    queryFn: () => api.get<AwardTemplate[]>('/award-rules/templates'),
  });
}

export function useRuleSetMutations(documentId: string) {
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['award-rule-sets'] });
    void qc.invalidateQueries({ queryKey: ['document', documentId] });
  };

  return {
    create: useMutation({
      mutationFn: (payload: RuleSetPayload) => api.post<AwardRuleSet>('/award-rules', payload),
      onSuccess: refresh,
    }),
    update: useMutation({
      mutationFn: (v: { id: string; payload: RuleSetPayload }) =>
        api.patch<AwardRuleSet>(`/award-rules/${v.id}`, v.payload),
      onSuccess: (saved) => {
        qc.setQueryData(['award-rule-set', saved.id], saved);
        refresh();
      },
    }),
    duplicate: useMutation({
      mutationFn: (id: string) => api.post<AwardRuleSet>(`/award-rules/${id}/duplicate`),
      onSuccess: refresh,
    }),
    remove: useMutation({
      mutationFn: (id: string) => api.delete(`/award-rules/${id}`),
      onSuccess: refresh,
    }),
    attach: useMutation({
      mutationFn: (ruleSetId: string | null) =>
        api.post<{ ruleSetId: string | null }>(`/documents/${documentId}/awards/rule-set`, {
          ruleSetId,
        }),
      onSuccess: refresh,
    }),
    /** Заготовка по колонкам загруженной таблицы. Ничего не сохраняет. */
    suggest: useMutation({
      mutationFn: () => api.post<AwardRuleSet>(`/documents/${documentId}/awards/suggest`, {}),
    }),
  };
}

/**
 * Превью раскладки по несохранённому набору.
 *
 * Считает сервер, хотя тот же движок есть и в браузере: перед выпуском
 * решение принимает сервер, и показывать одно, а выпускать другое нельзя.
 */
export function useAwardPreview(documentId: string) {
  return useMutation({
    mutationFn: (ruleSet?: RuleSetPayload) =>
      api.post<AwardPreview>(`/documents/${documentId}/awards/preview`, { ruleSet }),
  });
}
