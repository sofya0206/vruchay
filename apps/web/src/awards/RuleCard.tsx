import type { ReactNode } from 'react';
import { ArrowDown, ArrowUp, Ban, Copy, FileText, Plus, Trash2, X } from 'lucide-react';
import type { AwardOutput, AwardRule } from '@gramota/shared';
import { Button } from '../ui/Button';
import { Input, Select } from '../ui/Field';
import type { AwardTemplate } from '../api/awards';
import { ConditionRow } from './ConditionRow';
import { blankCondition, describeCondition } from './condition-labels';

interface Props {
  rule: AwardRule;
  index: number;
  total: number;
  columns: string[];
  templates: AwardTemplate[];
  hasGroupColumn: boolean;
  onChange: (next: AwardRule) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}

/**
 * Ширину задаём обёрткой, а не классом на самом поле: в базовых классах
 * Input и Select из ui/Field есть w-full, и он выигрывает у переданного
 * w-40. Без обёртки каждое поле занимало всю строку.
 */
function Sized({ width, children }: { width: string; children: ReactNode }) {
  return <div className={`${width} shrink-0`}>{children}</div>;
}

/**
 * Одно правило целиком: условия сверху, выдаваемые документы снизу.
 *
 * Номер правила показан крупно и не для красоты: выигрывает первое
 * совпавшее, и порядок здесь — самое важное, что человеку надо понять.
 * Пока номера не было, правила читались как независимый список,
 * и «2–3 место» ставили под «все остальные», не замечая последствий.
 */
export function RuleCard({
  rule,
  index,
  total,
  columns,
  templates,
  hasGroupColumn,
  onChange,
  onMove,
  onRemove,
}: Props) {
  const isFallback = rule.conditions.length === 0;
  const skip = rule.action === 'skip';

  const setOutput = (i: number, patch: Partial<AwardOutput>) =>
    onChange({
      ...rule,
      outputs: rule.outputs.map((o, j) => (j === i ? { ...o, ...patch } : o)),
    });

  return (
    <li
      className={`rounded-xl bg-[var(--surface)] ring-1 transition-opacity ${
        rule.enabled ? 'ring-[var(--line)]' : 'opacity-60 ring-[var(--line)]'
      }`}
    >
      <header className="flex flex-wrap items-center gap-2 border-b border-[var(--line)] px-4 py-2.5">
        <span
          className="tabular grid size-6 shrink-0 place-items-center rounded-full bg-[var(--surface-sunken)] text-xs font-medium text-[var(--text-muted)]"
          title="Порядок проверки: выигрывает первое совпавшее правило"
        >
          {index + 1}
        </span>

        <Sized width="w-52">
          <Input
            aria-label="Название правила"
            value={rule.label}
            placeholder={isFallback ? 'Все остальные' : 'Победители'}
            onChange={(e) => onChange({ ...rule, label: e.target.value })}
            className="font-medium"
          />
        </Sized>

        {isFallback && (
          <span className="rounded-full bg-[var(--surface-sunken)] px-2 py-1 text-xs text-[var(--text-muted)]">
            без условий — срабатывает всегда
          </span>
        )}

        <label className="ml-auto flex items-center gap-1.5 text-sm text-[var(--text-muted)]">
          <input
            type="checkbox"
            checked={rule.enabled}
            onChange={(e) => onChange({ ...rule, enabled: e.target.checked })}
          />
          включено
        </label>

        <div className="flex items-center">
          <button
            onClick={() => onMove(-1)}
            disabled={index === 0}
            aria-label="Выше"
            className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-sunken)] disabled:opacity-30"
          >
            <ArrowUp size={15} />
          </button>
          <button
            onClick={() => onMove(1)}
            disabled={index === total - 1}
            aria-label="Ниже"
            className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-sunken)] disabled:opacity-30"
          >
            <ArrowDown size={15} />
          </button>
          <button
            onClick={onRemove}
            aria-label="Удалить правило"
            className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </header>

      <div className="space-y-3 px-4 py-3">
        <section className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-medium tracking-wide text-[var(--text-muted)] uppercase">
            Если
            {rule.conditions.length > 1 && (
              <Sized width="w-52">
                <Select
                  aria-label="Как соединять условия"
                  value={rule.match}
                  onChange={(e) => onChange({ ...rule, match: e.target.value as 'all' | 'any' })}
                  className="py-1 text-xs normal-case"
                >
                  <option value="all">выполнены все условия</option>
                  <option value="any">выполнено хотя бы одно</option>
                </Select>
              </Sized>
            )}
          </div>

          {rule.conditions.map((condition, i) => (
            <ConditionRow
              key={i}
              condition={condition}
              columns={columns}
              hasGroupColumn={hasGroupColumn}
              onChange={(next) =>
                onChange({
                  ...rule,
                  conditions: rule.conditions.map((c, j) => (j === i ? next : c)),
                })
              }
              onRemove={() =>
                onChange({ ...rule, conditions: rule.conditions.filter((_, j) => j !== i) })
              }
            />
          ))}

          <Button
            variant="ghost"
            size="sm"
            icon={<Plus size={14} />}
            onClick={() =>
              onChange({
                ...rule,
                conditions: [
                  ...rule.conditions,
                  blankCondition(columns[0] ?? 'place', 'placeEquals'),
                ],
              })
            }
          >
            {isFallback ? 'Добавить условие' : 'И ещё условие'}
          </Button>
        </section>

        <section className="space-y-2 border-t border-[var(--line)] pt-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium tracking-wide text-[var(--text-muted)] uppercase">
              То
            </span>
            <Sized width="w-48">
              <Select
                aria-label="Что делать"
                value={rule.action}
                onChange={(e) =>
                  onChange({
                    ...rule,
                    action: e.target.value as 'issue' | 'skip',
                    // У правила «не выдавать» выходов не бывает: оставленные
                    // списком, они выглядели бы как обещание документа.
                    outputs: e.target.value === 'skip' ? [] : rule.outputs,
                  })
                }
                className="py-1 text-sm"
              >
                <option value="issue">выдать документы</option>
                <option value="skip">не выдавать ничего</option>
              </Select>
            </Sized>
          </div>

          {skip ? (
            <p className="flex items-start gap-2 rounded-lg bg-[var(--surface-sunken)] px-3 py-2 text-sm text-[var(--text-muted)]">
              <Ban size={15} className="mt-0.5 shrink-0" />
              Строка снимается с награждения и дальше не проверяется. В отчёте она
              останется — с пометкой, каким правилом снята.
            </p>
          ) : (
            <>
              {rule.outputs.map((output, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <FileText size={15} className="shrink-0 text-[var(--text-muted)]" />
                  <Sized width="w-60">
                    <Select
                      aria-label="Шаблон"
                      value={output.templateDocumentId}
                      onChange={(e) => setOutput(i, { templateDocumentId: e.target.value })}
                    >
                      <option value="">— выберите шаблон —</option>
                      {templates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.title}
                        </option>
                      ))}
                    </Select>
                  </Sized>

                  <span className="text-sm text-[var(--text-muted)]">кому:</span>
                  <Sized width="w-48">
                    <Select
                      aria-label="Получатель"
                      value={output.subjectColumn}
                      onChange={(e) =>
                        setOutput(i, {
                          subjectColumn: e.target.value,
                          // Дедупликация имеет смысл только у получателя из колонки.
                          dedupeScope: e.target.value ? output.dedupeScope : 'all',
                        })
                      }
                    >
                      <option value="">участнику</option>
                      {columns.map((c) => (
                        <option key={c} value={c}>
                          по колонке «{c}»
                        </option>
                      ))}
                    </Select>
                  </Sized>

                  {output.subjectColumn && (
                    <Sized width="w-56">
                      <Select
                        aria-label="Область дедупликации"
                        value={output.dedupeScope}
                        onChange={(e) =>
                          setOutput(i, { dedupeScope: e.target.value as 'all' | 'group' })
                        }
                        title="Одному тренеру — один документ, даже если у него пять призёров"
                      >
                        <option value="all">один на весь протокол</option>
                        <option value="group" disabled={!hasGroupColumn}>
                          один на каждую группу
                        </option>
                      </Select>
                    </Sized>
                  )}

                  <button
                    onClick={() =>
                      onChange({ ...rule, outputs: rule.outputs.filter((_, j) => j !== i) })
                    }
                    aria-label="Убрать документ"
                    className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text)]"
                  >
                    <X size={15} />
                  </button>
                </div>
              ))}

              <Button
                variant="ghost"
                size="sm"
                icon={<Copy size={14} />}
                onClick={() =>
                  onChange({
                    ...rule,
                    outputs: [
                      ...rule.outputs,
                      {
                        templateDocumentId: templates[0]?.id ?? '',
                        subjectColumn: '',
                        dedupeScope: 'all',
                        label: '',
                      },
                    ],
                  })
                }
              >
                {rule.outputs.length ? 'И ещё документ — например, тренеру' : 'Добавить документ'}
              </Button>
            </>
          )}
        </section>

        {rule.conditions.length > 0 && (
          <p className="text-xs text-[var(--text-muted)]">
            Если {rule.conditions.map(describeCondition).join(rule.match === 'any' ? ' или ' : ' и ')}
          </p>
        )}
      </div>
    </li>
  );
}
