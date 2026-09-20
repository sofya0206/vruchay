import { useMemo, useState } from 'react';
import { CheckCircle2, ChevronRight, CircleAlert, Info, ListChecks, ShieldCheck, TriangleAlert, Wand2, X } from 'lucide-react';
import {
  PROBLEM_KINDS,
  quotaFits,
  type BatchValidation,
  type ProblemCode,
  type RowProblem,
  type ValidatedRow,
} from '@gramota/shared';
import { useValidation, useValidationFixes, type CellFix } from '../api/validation';
import { DiscussTermsLink } from '../billing/DiscussTermsLink';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { ErrorBar } from '../ui/ErrorState';
import { Input } from '../ui/Field';
import { IconButton } from '../ui/IconButton';
import { NextAction } from '../ui/NextAction';
import { TBody, THead, Table, Td, Th, Tr } from '../ui/Table';
import { Segmented } from '../ui/Tabs';
import { cn } from '../ui/cn';
import { errorText } from '../api/client';

/**
 * Проверка всех строк до выпуска.
 *
 * Смысл экрана — заменить чтение таблицы глазами. До него единственным
 * способом узнать, что фамилия не влезет в блок или что адрес набран
 * в русской раскладке, была готовая пачка PDF и вопрос участника
 * «а где мой документ».
 *
 * Поэтому таблица устроена как список дел, а не как отчёт: каждая строка
 * говорит, что не так, чем это кончится и что с этим сделать. Читать
 * её сверху донизу не нужно — нужно чинить.
 */
export function ValidationScreen({
  documentId,
  onDone,
}: {
  documentId: string;
  /** Проверка пройдена — дальше по шагам, к письму. */
  onDone: () => void;
}) {
  const validation = useValidation(documentId);
  const { fix, exclude } = useValidationFixes(documentId);
  const [report, setReport] = useState<BatchValidation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<ProblemCode | 'all'>('all');

  async function run(scope: 'checked' | 'all' = 'checked') {
    setError(null);
    try {
      setReport(await validation.mutateAsync(scope));
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function apply(fixes: CellFix[]) {
    setError(null);
    try {
      await fix.mutateAsync(fixes);
      // Перепроверяем сразу: правка одной ячейки может убрать повтор
      // в соседней строке, и показывать устаревший разбор нельзя.
      await run();
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function drop(rowIds: string[]) {
    setError(null);
    try {
      await exclude.mutateAsync(rowIds);
      await run();
    } catch (err) {
      setError(errorText(err));
    }
  }

  const busy = validation.isPending || fix.isPending || exclude.isPending;

  if (!report) {
    return (
      <div className="mx-auto w-full max-w-2xl p-6">
        {error && <ErrorBar className="mb-4">{error}</ErrorBar>}
        <Card padding="none">
          <NextAction
            icon={ShieldCheck}
            title="Проверьте строки до выпуска"
            text="Пройдём по каждой отмеченной строке и посмотрим, что случится на печати: влезет ли фамилия, не пустое ли обязательное поле, нет ли повторов, дойдёт ли письмо. Ничего не выпускаем и не меняем — только показываем."
            primary={
              <Button
                variant="primary"
                size="lg"
                icon={<ListChecks size={16} />}
                loading={validation.isPending}
                onClick={() => void run()}
                data-tour="check-run"
              >
                Проверить отмеченные
              </Button>
            }
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Summary
        report={report}
        busy={busy}
        onRecheck={() => void run()}
        onUncheckBlocked={() => {
          const dirty = report.rows.filter(isBlocked).map((r) => r.rowId);
          if (dirty.length) void drop(dirty);
          else onDone();
        }}
        onDone={onDone}
      />

      {error && <ErrorBar className="mx-4 mt-3">{error}</ErrorBar>}

      {report.rows.length === 0 ? (
        <div className="mx-auto w-full max-w-2xl p-6">
          <Card padding="none">
            <NextAction
              icon={CheckCircle2}
              title="Замечаний нет — можно дальше"
              text={`Проверили ${report.total} ${plural(report.total, 'строку', 'строки', 'строк')} — всё на месте.`}
              primary={{ label: 'Дальше: Письмо', onClick: onDone }}
              secondary={{ label: 'Проверить ещё раз', onClick: () => void run() }}
            />
          </Card>
        </div>
      ) : (
        <>
          <Filters report={report} value={filter} onChange={setFilter} />
          <ProblemTable
            report={report}
            filter={filter}
            busy={busy}
            onFix={(fixes) => void apply(fixes)}
            onExclude={(ids) => void drop(ids)}
          />
        </>
      )}
    </div>
  );
}

function Summary({
  report,
  busy,
  onRecheck,
  onUncheckBlocked,
  onDone,
}: {
  report: BatchValidation;
  busy: boolean;
  onRecheck: () => void;
  onUncheckBlocked: () => void;
  onDone: () => void;
}) {
  const warnings = report.rows.length - report.blocked;

  return (
    <div className="border-b border-line bg-surface">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3">
        <Count value={report.clean} label="без замечаний" tone="ok" />
        {report.blocked > 0 && <Count value={report.blocked} label="нельзя выпускать" tone="danger" />}
        {warnings > 0 && <Count value={warnings} label="стоит посмотреть" tone="warn" />}

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button size="sm" loading={busy} onClick={onRecheck}>
            Проверить заново
          </Button>
          {report.blocked > 0 ? (
            /*
             * Кнопка снимает отметки и на этом останавливается — выпуск
             * человек запускает сам на шаге выпуска. Прежнее «Выпустить
             * только чистые» обещало выпуск, которого не было.
             */
            <Button size="sm" variant="primary" disabled={busy} onClick={onUncheckBlocked}>
              Снять отметки с проблемных строк: {report.blocked}
            </Button>
          ) : (
            <Button size="sm" variant="primary" disabled={busy} onClick={onDone} icon={<ChevronRight size={16} />}>
              Дальше: Письмо
            </Button>
          )}
        </div>
      </div>

      <QuotaLine quota={report.quota} />
      <Caveats items={report.caveats} />
    </div>
  );
}

function Count({ value, label, tone }: { value: number; label: string; tone: 'ok' | 'warn' | 'danger' }) {
  const colors = { ok: 'text-ok', warn: 'text-warn', danger: 'text-danger' } as const;
  return (
    <span className="flex items-baseline gap-1.5">
      <span className={cn('tabular text-lg font-medium', colors[tone])}>{value}</span>
      <span className="text-sm text-muted">{label}</span>
    </span>
  );
}

/**
 * Квота — до выпуска, а не после.
 *
 * Узнать об исчерпанной пробе на сорок седьмом документе из пятидесяти —
 * это уже испорченное награждение, и здесь у нас последняя возможность
 * сказать об этом заранее. Доплаты не предлагаем — выпуска сверх предела
 * в сервисе нет; путь дальше один — разговор об условиях.
 */
function QuotaLine({ quota }: { quota: BatchValidation['quota'] }) {
  if (quota.plan === 'paid' || quota.limit === null) return null;

  const left = quota.left ?? 0;

  if (quotaFits(quota)) {
    return (
      <p className="border-t border-line px-4 py-2 text-sm text-muted">
        Бесплатная проба: останется <span className="tabular">{left - quota.adding}</span> из{' '}
        <span className="tabular">{quota.limit}</span> документов.
      </p>
    );
  }

  return (
    <p className="flex flex-wrap items-baseline gap-x-1.5 border-t border-line bg-warn-soft px-4 py-2 text-sm">
      <TriangleAlert size={16} className="self-center text-warn" aria-hidden />
      <span>
        Отмечено <span className="tabular font-medium">{quota.adding}</span>{' '}
        {plural(quota.adding, 'строка', 'строки', 'строк')}, а на бесплатной пробе доступно{' '}
        <span className="tabular font-medium">{left}</span> {plural(left, 'документ', 'документа', 'документов')} из{' '}
        <span className="tabular">{quota.limit}</span>. Выпуск не начнётся: снимите лишние отметки или{' '}
        <DiscussTermsLink>обсудите условия под ваш объём</DiscussTermsLink>.
      </span>
    </p>
  );
}

/**
 * Чего проверка не знает. Показываем, а не прячем: проверка, молчащая
 * о своих границах, внушает больше доверия, чем заслуживает.
 */
function Caveats({ items }: { items: string[] }) {
  const [open, setOpen] = useState(false);
  if (!items.length) return null;

  return (
    <div className="border-t border-line px-3 py-1.5">
      <Button variant="ghost" size="sm" onClick={() => setOpen(!open)} aria-expanded={open} icon={<Info size={16} />}>
        Что проверка не смотрела ({items.length})
        <ChevronRight size={16} className={cn('transition-transform', open && 'rotate-90')} aria-hidden />
      </Button>
      {open && (
        <ul className="mt-1 space-y-1 pl-9 text-xs text-muted">
          {items.map((item, i) => (
            <li key={i} className="list-disc">
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Filters({
  report,
  value,
  onChange,
}: {
  report: BatchValidation;
  value: ProblemCode | 'all';
  onChange: (v: ProblemCode | 'all') => void;
}) {
  const counts = useMemo(() => {
    const map = new Map<ProblemCode, number>();
    for (const row of report.rows) {
      // Считаем строки, а не проблемы: человек чинит строки.
      for (const code of new Set(row.problems.map((p) => p.code))) {
        map.set(code, (map.get(code) ?? 0) + 1);
      }
    }
    return [...map].sort((a, b) => b[1] - a[1]);
  }, [report]);

  return (
    <div className="border-b border-line px-4 py-2">
      <Segmented
        label="Замечания"
        value={value}
        onChange={onChange}
        items={[
          { id: 'all' as const, label: 'Все', count: report.rows.length },
          ...counts.map(([code, count]) => ({ id: code, label: PROBLEM_KINDS[code].title, count })),
        ]}
      />
    </div>
  );
}

/** Сколько строк показываем сразу: список бывает на тысячи. */
const PAGE = 100;

function ProblemTable({
  report,
  filter,
  busy,
  onFix,
  onExclude,
}: {
  report: BatchValidation;
  filter: ProblemCode | 'all';
  busy: boolean;
  onFix: (fixes: CellFix[]) => void;
  onExclude: (rowIds: string[]) => void;
}) {
  const [shown, setShown] = useState(PAGE);

  const rows = useMemo(
    () => (filter === 'all' ? report.rows : report.rows.filter((r) => r.problems.some((p) => p.code === filter))),
    [report, filter],
  );

  /**
   * Одинаковые правки во всём списке — то, ради чего экран и нужен.
   * «ФИО прописными» в выгрузке из протокола встречается не в одной строке,
   * а во всех трёхстах, и чинить их по одной — ручной труд, от которого
   * сервис избавляет.
   */
  const bulk = useMemo(() => {
    const map = new Map<ProblemCode, CellFix[]>();
    for (const row of report.rows) {
      for (const problem of row.problems) {
        if (!problem.suggestion || !problem.column) continue;
        const list = map.get(problem.code) ?? [];
        list.push({ rowId: row.rowId, column: problem.column, value: problem.suggestion });
        map.set(problem.code, list);
      }
    }
    return map;
  }, [report]);

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      {[...bulk]
        .filter(([, fixes]) => fixes.length > 1)
        .map(([code, fixes]) => (
          <div key={code} className="flex flex-wrap items-center gap-2 border-b border-line bg-accent-soft px-4 py-2 text-sm">
            <Wand2 size={16} className="text-accent" aria-hidden />
            <span>
              «{PROBLEM_KINDS[code].title}» — в {fixes.length} {plural(fixes.length, 'строке', 'строках', 'строках')}.
              Исправление подставляется однозначно.
            </span>
            <Button size="sm" className="ml-auto" disabled={busy} onClick={() => onFix(fixes)}>
              Исправить все {fixes.length}
            </Button>
          </div>
        ))}

      <Table caption="Замечания по строкам" stickyHeader={false}>
        <THead>
          <Tr>
            {/* Имя занимает больше номера: по нему строку и узнают в лицо. */}
            <Th className="w-56">Строка</Th>
            <Th className="w-44">Проблема</Th>
            <Th>Причина</Th>
            <Th className="w-72">Что сделать</Th>
          </Tr>
        </THead>
        <TBody>
          {rows.slice(0, shown).map((row) => (
            <RowBlock key={row.rowId} row={row} busy={busy} onFix={onFix} onExclude={() => onExclude([row.rowId])} />
          ))}
        </TBody>
      </Table>

      {rows.length > shown && (
        <div className="p-4 text-center">
          <Button onClick={() => setShown(shown + PAGE)}>
            Показать ещё {Math.min(PAGE, rows.length - shown)} из {rows.length - shown}
          </Button>
        </div>
      )}
    </div>
  );
}

function RowBlock({
  row,
  busy,
  onFix,
  onExclude,
}: {
  row: ValidatedRow;
  busy: boolean;
  onFix: (fixes: CellFix[]) => void;
  onExclude: () => void;
}) {
  return (
    <>
      {row.problems.map((problem, index) => (
        <Tr key={`${problem.code}-${index}`} className="align-top">
          {/* Номер и имя пишем один раз на строку списка, а не на каждое замечание. */}
          {index === 0 ? (
            <Td className="h-auto py-2.5" rowSpan={row.problems.length}>
              <span className="tabular font-medium">{row.position}</span>
              <span className="mt-0.5 block text-xs break-words text-muted">{row.title}</span>
            </Td>
          ) : null}

          <Td className="h-auto py-2.5">
            <ProblemBadge code={problem.code} />
          </Td>

          <Td className="h-auto py-2.5">
            <span className="block break-words">{problem.detail}</span>
            <span className="mt-0.5 block text-xs text-muted">{PROBLEM_KINDS[problem.code].consequence}</span>
          </Td>

          <Td className="h-auto py-2.5">
            <Action row={row} problem={problem} busy={busy} onFix={onFix} onExclude={index === 0 ? onExclude : undefined} />
          </Td>
        </Tr>
      ))}
    </>
  );
}

function ProblemBadge({ code }: { code: ProblemCode }) {
  const kind = PROBLEM_KINDS[code];
  const blocking = kind.severity === 'blocker';
  return (
    <Badge tone={blocking ? 'danger' : 'warn'}>
      {blocking ? <CircleAlert size={12} aria-hidden /> : <TriangleAlert size={12} aria-hidden />}
      {kind.title}
    </Badge>
  );
}

/**
 * Что можно сделать со строкой прямо здесь.
 *
 * Правка на месте есть не у всякой беды: «не влезает в блок» чинится
 * в редакторе или сокращением имени, и подставлять за человека укороченную
 * фамилию мы не вправе. Там, где исправление однозначно, — предлагаем его
 * готовым; там, где нет, — даём поле и исключение из выпуска.
 */
function Action({
  row,
  problem,
  busy,
  onFix,
  onExclude,
}: {
  row: ValidatedRow;
  problem: RowProblem;
  busy: boolean;
  onFix: (fixes: CellFix[]) => void;
  onExclude?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(problem.suggestion ?? '');

  if (!problem.column) {
    return onExclude ? <ExcludeButton busy={busy} onClick={onExclude} /> : null;
  }

  const commit = () => {
    onFix([{ rowId: row.rowId, column: problem.column!, value }]);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1.5">
        <Input
          autoFocus
          compact
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setEditing(false);
            if (e.key === 'Enter') commit();
          }}
          aria-label={`Новое значение колонки «${problem.column}»`}
        />
        <Button size="sm" variant="primary" disabled={busy} onClick={commit}>
          ОК
        </Button>
        <IconButton size="sm" label="Отменить правку" onClick={() => setEditing(false)}>
          <X size={16} />
        </IconButton>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {problem.suggestion && (
        <Button
          size="sm"
          disabled={busy}
          icon={<Wand2 size={16} />}
          onClick={() => onFix([{ rowId: row.rowId, column: problem.column!, value: problem.suggestion! }])}
          title={`Заменить на «${problem.suggestion}»`}
        >
          <span className="max-w-40 truncate">{problem.suggestion}</span>
        </Button>
      )}
      <Button size="sm" variant="ghost" disabled={busy} onClick={() => setEditing(true)}>
        Исправить
      </Button>
      {onExclude && <ExcludeButton busy={busy} onClick={onExclude} />}
    </div>
  );
}

function ExcludeButton({ busy, onClick }: { busy: boolean; onClick: () => void }) {
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={busy}
      onClick={onClick}
      // Именно «исключить», а не «удалить»: строка остаётся в таблице
      // со своими данными, к ней вернутся, когда разберутся.
      title="Снять отметку — строка останется в таблице, но не попадёт в выпуск"
    >
      Исключить
    </Button>
  );
}

function isBlocked(row: ValidatedRow): boolean {
  return row.problems.some((p) => PROBLEM_KINDS[p.code].severity === 'blocker');
}

function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}
