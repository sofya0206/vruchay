import { useEffect, useMemo, useState } from 'react';
import { Copy, Plus, Save, Wand2 } from 'lucide-react';
import type { AwardRule, AwardRuleSet } from '@gramota/shared';
import { AWARD_RULES_SCHEMA_VERSION } from '@gramota/shared';
import { ApiError } from '../api/client';
import { useRecipients } from '../api/recipients';
import {
  useAwardPreview,
  useAwardTemplates,
  useRuleSet,
  useRuleSetMutations,
  useRuleSets,
} from '../api/awards';
import type { RuleSetPayload } from '../api/awards';
import { Button } from '../ui/Button';
import { Input, Label } from '../ui/Field';
import { Select } from '../ui/Select';
import { Loading } from '../ui/Loading';
import { RuleCard } from './RuleCard';
import { PreviewPanel } from './PreviewPanel';
import { Tooltip } from '../ui/Tooltip';

interface Props {
  documentId: string;
  /** Набор, привязанный к соревнованию сейчас. */
  ruleSetId: string | null;
}

/**
 * Конструктор правил награждения.
 *
 * Правила принадлежат организации, а к соревнованию только привязываются:
 * федерация настраивает награждение один раз на сезон и на следующем
 * протоколе выбирает готовый набор, а не собирает его заново.
 */
export function RulesTab({ documentId, ruleSetId }: Props) {
  const sets = useRuleSets();
  const attached = useRuleSet(ruleSetId);
  const templates = useAwardTemplates();
  const recipients = useRecipients(documentId);
  const mutations = useRuleSetMutations(documentId);
  const preview = useAwardPreview(documentId);

  /** Черновик: правки живут здесь, пока человек не нажмёт «Сохранить». */
  const [draft, setDraft] = useState<AwardRuleSet | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  /*
   * Привязанный набор берём в работу, но правки поверх него не затираем:
   * запрос мог обновиться в фоне, пока человек правит условия, и подмена
   * черновика стёрла бы несохранённое.
   */
  const loaded = attached.data;
  useEffect(() => {
    if (!ruleSetId) {
      setDraft(null);
      return;
    }
    if (!loaded) return;
    setDraft((current) => (current && current.id === loaded.id ? current : loaded));
  }, [loaded, ruleSetId]);

  const columns = useMemo(
    () => recipients.data?.columns.map((c) => c.name) ?? [],
    [recipients.data],
  );

  const payload = useMemo<RuleSetPayload | undefined>(
    () =>
      draft
        ? {
            name: draft.name,
            groupColumn: draft.groupColumn,
            statusColumn: draft.statusColumn,
            rules: draft.rules,
          }
        : undefined,
    [draft],
  );

  const patch = (next: Partial<AwardRuleSet>) => setDraft((d) => (d ? { ...d, ...next } : d));

  const setRules = (rules: AwardRule[]) =>
    patch({ rules: rules.map((r, position) => ({ ...r, position })) });

  const move = (index: number, direction: -1 | 1) => {
    if (!draft) return;
    const target = index + direction;
    if (target < 0 || target >= draft.rules.length) return;
    const rules = [...draft.rules];
    [rules[index], rules[target]] = [rules[target], rules[index]];
    setRules(rules);
  };

  const runPreview = () => {
    if (!payload) return;
    preview.mutate(payload);
  };

  const save = async () => {
    if (!draft || !payload) return;
    setSaveError(null);
    try {
      const saved = draft.id.startsWith('new-')
        ? await mutations.create.mutateAsync(payload)
        : await mutations.update.mutateAsync({ id: draft.id, payload });
      setDraft(saved);
      if (saved.id !== ruleSetId) await mutations.attach.mutateAsync(saved.id);
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : 'Не удалось сохранить набор');
    }
  };

  if (sets.isLoading || recipients.isLoading) return <Loading />;

  if (!draft) {
    return (
      <StartScreen
        sets={sets.data ?? []}
        hasColumns={columns.length > 0}
        onPick={(id) => void mutations.attach.mutateAsync(id)}
        onSuggest={async () => setDraft(asNew(await mutations.suggest.mutateAsync()))}
        onBlank={() => setDraft(blankRuleSet())}
        suggesting={mutations.suggest.isPending}
      />
    );
  }

  const previewError =
    preview.error instanceof ApiError
      ? preview.error.message
      : preview.error
        ? 'Не удалось посчитать раскладку'
        : null;

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 p-4 lg:flex-row">
        <div className="min-w-0 flex-1 space-y-4">
          <section className="grid gap-3 rounded-xl bg-[var(--surface)] p-4 ring-1 ring-[var(--line)] sm:grid-cols-3">
            <div className="sm:col-span-3">
              <Label>Название набора</Label>
              <Input
                value={draft.name}
                onChange={(e) => patch({ name: e.target.value })}
                placeholder="Награждение по протоколу"
              />
            </div>

            <div>
              <Label>Колонка группы</Label>
              <Select
                value={draft.groupColumn}
                onChange={(groupColumn) => patch({ groupColumn })}
                aria-label="Колонка группы"
                options={[
                  { value: '', label: 'весь протокол — одна группа' },
                  ...columns.map((c) => ({ value: c, label: c })),
                ]}
              />
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                По ней ищутся повторы получателя и, если у условия взведено «внутри группы»,
                пересчитывается место.
              </p>
            </div>

            <div>
              <Label>Колонка статуса</Label>
              <Select
                value={draft.statusColumn}
                onChange={(statusColumn) => patch({ statusColumn })}
                aria-label="Колонка статуса"
                options={[
                  { value: '', label: 'статусов нет' },
                  ...columns.map((c) => ({ value: c, label: c })),
                ]}
              />
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                DSQ, DNS, «снят» — по ней работает правило «не выдавать».
              </p>
            </div>

            <div className="flex items-end gap-2">
              <Button
                variant="primary"
                icon={<Save size={15} />}
                onClick={() => void save()}
                disabled={mutations.create.isPending || mutations.update.isPending}
              >
                Сохранить
              </Button>
              {!draft.id.startsWith('new-') && (
                <Button
                  icon={<Copy size={15} />}
                  title="Копия набора — чтобы поправить под другое соревнование"
                  onClick={async () => setDraft(await mutations.duplicate.mutateAsync(draft.id))}
                >
                  Копия
                </Button>
              )}
            </div>

            {saveError && (
              <p className="rounded-lg bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)] sm:col-span-3">
                {saveError}
              </p>
            )}
          </section>

          <p className="text-sm text-[var(--text-muted)]">
            Правила проверяются сверху вниз: выигрывает первое совпавшее. Последним ставьте правило
            без условий — оно поймает всех, кого не разобрали правила выше.
          </p>

          <ul className="space-y-3">
            {draft.rules.map((rule, index) => (
              <RuleCard
                key={rule.id}
                rule={rule}
                index={index}
                total={draft.rules.length}
                columns={columns}
                templates={templates.data ?? []}
                hasGroupColumn={draft.groupColumn !== ''}
                onChange={(next) => setRules(draft.rules.map((r, j) => (j === index ? next : r)))}
                onMove={(direction) => move(index, direction)}
                onRemove={() => setRules(draft.rules.filter((_, j) => j !== index))}
              />
            ))}
          </ul>

          <Button
            icon={<Plus size={15} />}
            onClick={() => setRules([...draft.rules, blankRule(columns[0] ?? 'place')])}
          >
            Добавить правило
          </Button>
        </div>

        <PreviewPanel
          plan={preview.data?.plan ?? null}
          problems={preview.data?.problems ?? []}
          loading={preview.isPending}
          error={previewError}
          onRefresh={runPreview}
        />
      </div>
    </div>
  );
}

/** Первый экран: взять готовый набор, собрать по колонкам или начать с нуля. */
function StartScreen({
  sets,
  hasColumns,
  onPick,
  onSuggest,
  onBlank,
  suggesting,
}: {
  sets: { id: string; name: string; ruleCount: number; documentCount: number }[];
  hasColumns: boolean;
  onPick: (id: string) => void;
  onSuggest: () => void;
  onBlank: () => void;
  suggesting: boolean;
}) {
  return (
    <div className="mx-auto max-w-2xl space-y-5 p-8">
      <div>
        <h2 className="text-lg font-medium">Правила награждения</h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          «Первое место — диплом победителя, снятым ничего, остальным грамота участника». Набор
          сохраняется и переиспользуется на следующем соревновании.
        </p>
      </div>

      {sets.length > 0 && (
        <section>
          <Label>Готовые наборы</Label>
          <ul className="space-y-2">
            {sets.map((s) => (
              <li key={s.id}>
                <button
                  onClick={() => onPick(s.id)}
                  className="flex w-full items-center gap-3 rounded-xl bg-[var(--surface)] px-4 py-3 text-left ring-1 ring-[var(--line)] transition-colors hover:bg-[var(--surface-sunken)]"
                >
                  <span className="font-medium">{s.name}</span>
                  <span className="ml-auto text-sm text-[var(--text-muted)]">
                    правил: {s.ruleCount}
                    {s.documentCount > 0 && ` · применён: ${s.documentCount}`}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-wrap gap-2">
        <Tooltip label={hasColumns ? undefined : 'Сначала загрузите протокол на вкладке «Получатели»'}>
          <Button
            variant="primary"
            icon={<Wand2 size={15} />}
            onClick={onSuggest}
            disabled={!hasColumns || suggesting}
          >
            Собрать по колонкам протокола
          </Button>
        </Tooltip>
        {/* Второй кнопкой это читалось как выбор из двух равных, хотя
            пустой набор нужен редко. Остаётся, но тихо. */}
        <button
          type="button"
          onClick={onBlank}
          className="inline-flex items-center gap-1 self-center text-sm text-[var(--text-muted)] underline-offset-4 hover:text-[var(--text)] hover:underline"
        >
          <Plus size={14} />
          или начать с нуля
        </button>
      </div>

      {!hasColumns && (
        <p className="text-sm text-[var(--text-muted)]">
          В таблице получателей пока нет колонок. Загрузите протокол на вкладке «Получатели» — тогда
          заготовка сама найдёт место, группу и статус.
        </p>
      )}
    </div>
  );
}

/**
 * Черновик нового набора помечается идентификатором «new-…»: по нему
 * решается, создавать набор или обновлять существующий. Настоящий UUID
 * выдаёт база — придумывать его на клиенте значило бы дать клиенту
 * назначать первичные ключи.
 */
function blankRuleSet(): AwardRuleSet {
  return {
    id: `new-${crypto.randomUUID()}`,
    name: '',
    schemaVersion: AWARD_RULES_SCHEMA_VERSION,
    groupColumn: '',
    statusColumn: '',
    rules: [],
  };
}

/** Заготовка с сервера ещё не сохранена — помечаем её как новый набор. */
function asNew(suggested: AwardRuleSet): AwardRuleSet {
  return { ...suggested, id: `new-${suggested.id}` };
}

function blankRule(field: string): AwardRule {
  return {
    id: crypto.randomUUID(),
    position: 0,
    enabled: true,
    label: '',
    match: 'all',
    conditions: [{ field, op: 'placeEquals', value: 1, withinGroup: false }],
    action: 'issue',
    outputs: [],
  };
}
