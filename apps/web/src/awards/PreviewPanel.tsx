import { useState } from 'react';
import { AlertTriangle, CircleAlert, Layers, Users } from 'lucide-react';
import type { AwardIssueCode, AwardPlan, AwardPlanIssue } from '@gramota/shared';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { ErrorBar } from '../ui/ErrorState';

interface Props {
  plan: AwardPlan | null;
  problems: string[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}

/**
 * Превью раскладки: сколько чего выйдет, если выпустить прямо сейчас.
 *
 * Числа стоят раньше замечаний намеренно. «Дипломов победителя — 12»
 * человек сверяет с протоколом за секунду и ловит этим ошибку в правилах
 * надёжнее, чем любой проверкой: он знает, что победителей восемь.
 */
export function PreviewPanel({ plan, problems, loading, error, onRefresh }: Props) {
  const [openReport, setOpenReport] = useState(false);

  return (
    <aside className="w-full shrink-0 space-y-3 lg:w-96">
      <Card padding="sm">
        <div className="mb-3 flex items-center gap-2">
          <Layers size={16} className="text-muted" />
          <h3 className="font-medium">Что выйдет</h3>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={onRefresh}
            disabled={loading}
          >
            {loading ? 'Считаем…' : 'Пересчитать'}
          </Button>
        </div>

        {error && <ErrorBar>{error}</ErrorBar>}

        {!plan && !error && (
          <p className="text-sm text-muted">
            Соберите правила и нажмите «Пересчитать» — покажем, сколько каких документов
            получится, ещё до выпуска.
          </p>
        )}

        {plan && (
          <>
            {plan.summary.length === 0 ? (
              <p className="text-sm text-muted">
                Пока ни одного документа: у правил не выбраны шаблоны или ни одна строка
                под них не подошла.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {plan.summary.map((row) => (
                  <li key={row.templateDocumentId} className="flex items-baseline gap-2 text-sm">
                    <span className="truncate" title={row.templateTitle}>
                      {row.templateTitle}
                    </span>
                    <span className="min-w-4 flex-1 border-b border-dotted border-line-strong" />
                    <span className="tabular font-medium">{row.count}</span>
                  </li>
                ))}
              </ul>
            )}

            <dl className="mt-3 space-y-1 border-t border-line pt-3 text-sm text-muted">
              <Stat label="Строк в протоколе" value={plan.totals.rows} />
              <Stat label="Документов всего" value={plan.totals.documents} />
              {plan.totals.deduplicated > 0 && (
                <Stat
                  label="Слито дедупликацией"
                  value={plan.totals.deduplicated}
                  hint="Одному тренеру — один документ, сколько бы призёров он ни вывел"
                />
              )}
              {plan.totals.excludedRows > 0 && (
                <Stat label="Снято правилами" value={plan.totals.excludedRows} />
              )}
              {plan.totals.unmatchedRows > 0 && (
                <Stat label="Без правила" value={plan.totals.unmatchedRows} tone="danger" />
              )}
              {plan.totals.blockedRows > 0 && (
                <Stat
                  label="Остановлено ошибкой"
                  value={plan.totals.blockedRows}
                  tone="danger"
                  hint="Например, непонятная отметка в графе статуса"
                />
              )}
            </dl>
          </>
        )}
      </Card>

      {problems.length > 0 && (
        <ul className="space-y-1.5 rounded-card bg-warn-soft px-4 py-3 text-sm text-warn">
          {problems.map((p) => (
            <li key={p} className="flex gap-2">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              {p}
            </li>
          ))}
        </ul>
      )}

      {plan && plan.issues.length > 0 && (
        <Card padding="none">
          <button
            type="button"
            onClick={() => setOpenReport((v) => !v)}
            className="pressable flex w-full items-center gap-2 rounded-card px-4 py-3 text-left hover:bg-row-hover"
            aria-expanded={openReport}
          >
            <Users size={16} className="text-muted" />
            <span className="font-medium">Строки, о которых надо знать</span>
            <span className="tabular ml-auto text-sm text-muted">
              {plan.issues.length}
            </span>
          </button>

          {openReport && <IssueReport issues={plan.issues} />}
        </Card>
      )}
    </aside>
  );
}

/**
 * Поимённый отчёт по строкам.
 *
 * Строка без правила не должна исчезать молча — это единственная ошибка
 * раскладки, которую человек не заметит на превью: недостающий документ
 * не показывается нигде. Поэтому её видно по имени и по номеру строки,
 * а не числом в сводке.
 */
function IssueReport({ issues }: { issues: AwardPlanIssue[] }) {
  const groups = groupByCode(issues);

  return (
    <div className="max-h-96 space-y-3 overflow-y-auto border-t border-line px-4 py-3">
      {groups.map(([code, list]) => (
        <section key={code}>
          <h4 className="mb-1 flex items-center gap-1.5 text-xs font-medium tracking-wide uppercase">
            {list[0].severity === 'error' ? (
              <CircleAlert size={13} className="text-danger" />
            ) : (
              <AlertTriangle size={13} className="text-info" />
            )}
            <span
              className={
                list[0].severity === 'error' ? 'text-danger' : 'text-info'
              }
            >
              {ISSUE_TITLES[code]}
            </span>
            <span className="tabular text-muted">{list.length}</span>
          </h4>
          <ul className="space-y-0.5 text-sm">
            {list.slice(0, 50).map((issue, i) => (
              <li key={`${issue.rowId}-${i}`} className="flex gap-2">
                <span className="tabular w-8 shrink-0 text-right text-muted">
                  {issue.rowNumber}
                </span>
                <span className="truncate" title={issue.message}>
                  {issue.subject || '— без имени —'}
                  {issue.group && (
                    <span className="text-muted"> · {issue.group}</span>
                  )}
                </span>
              </li>
            ))}
            {list.length > 50 && (
              <li className="text-muted">…и ещё {list.length - 50}</li>
            )}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** Ошибки — выше предупреждений: сначала то, из-за чего документ не выйдет. */
function groupByCode(issues: AwardPlanIssue[]): [AwardIssueCode, AwardPlanIssue[]][] {
  const byCode = new Map<AwardIssueCode, AwardPlanIssue[]>();
  for (const issue of issues) {
    const list = byCode.get(issue.code) ?? [];
    list.push(issue);
    byCode.set(issue.code, list);
  }
  return [...byCode.entries()].sort(([, a], [, b]) => {
    if (a[0].severity !== b[0].severity) return a[0].severity === 'error' ? -1 : 1;
    return b.length - a.length;
  });
}

const ISSUE_TITLES: Record<AwardIssueCode, string> = {
  'no-rule': 'Не подошло ни одно правило',
  'excluded-by-rule': 'Сняты правилом',
  'missing-group': 'Не заполнена группа',
  'unparsable-place': 'Не разобрано место',
  'unknown-status': 'Непонятный статус',
  'no-template': 'Шаблон недоступен',
  'empty-subject': 'Некому выдавать',
  'duplicate-subject': 'Один документ на несколько строк',
};

function Stat({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: number;
  tone?: 'danger';
  hint?: string;
}) {
  return (
    <div className="flex justify-between gap-2" title={hint}>
      <dt>{label}</dt>
      <dd
        className={`tabular font-medium ${tone === 'danger' ? 'text-danger' : 'text-ink'}`}
      >
        {value}
      </dd>
    </div>
  );
}
