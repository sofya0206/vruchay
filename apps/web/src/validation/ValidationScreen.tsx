import { useMemo, useState } from 'react';
import {
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Info,
  ListChecks,
  LoaderCircle,
  ShieldCheck,
  TriangleAlert,
  Wand2,
  X,
} from 'lucide-react';
import {
  PROBLEM_KINDS,
  quotaFits,
  type BatchValidation,
  type ProblemCode,
  type RowProblem,
  type ValidatedRow,
} from '@gramota/shared';
import { useValidation, useValidationFixes, type CellFix } from '../api/validation';
import { Button } from '../ui/Button';
import { Input } from '../ui/Field';

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
  /** Проверка пройдена — можно возвращаться к выпуску. */
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
      setError((err as Error).message);
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
      setError((err as Error).message);
    }
  }

  async function drop(rowIds: string[]) {
    setError(null);
    try {
      await exclude.mutateAsync(rowIds);
      await run();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const busy = validation.isPending || fix.isPending || exclude.isPending;

  if (!report) {
    return (
      <Intro onRun={() => void run()} busy={validation.isPending} error={error} />
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

      {error && (
        <p role="alert" className="border-b border-[var(--line)] px-4 py-2 text-sm text-[var(--danger)]">
          {error}
        </p>
      )}

      {report.rows.length === 0 ? (
        <AllClean total={report.total} onDone={onDone} />
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

/** Первый экран: объясняем, что проверка делает, до того как её запустили. */
function Intro({
  onRun,
  busy,
  error,
}: {
  onRun: () => void;
  busy: boolean;
  error: string | null;
}) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-6">
      <div className="max-w-md text-center">
        <ShieldCheck size={40} className="mx-auto text-[var(--accent)]" />
        <h2 className="mt-4 font-serif text-xl">Проверить все строки до выпуска</h2>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Пройдём по каждой строке и посмотрим, что случится на печати: влезет ли
          фамилия в блок, не пустое ли обязательное поле, нет ли повторов, дойдёт ли
          письмо. Ничего не выпускаем и не меняем — просто смотрим.
        </p>

        {error && (
          <p role="alert" className="mt-4 text-sm text-[var(--danger)]">
            {error}
          </p>
        )}

        <Button variant="primary" className="mt-5" onClick={onRun} disabled={busy}>
          {busy ? (
            <>
              <LoaderCircle size={16} className="animate-spin" /> Проверяем…
            </>
          ) : (
            <>
              <ListChecks size={16} /> Проверить отмеченные строки
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

function AllClean({ total, onDone }: { total: number; onDone: () => void }) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-6">
      <div className="max-w-sm text-center">
        <CheckCircle2 size={40} className="mx-auto text-[var(--accent)]" />
        <h2 className="mt-4 font-serif text-xl">Замечаний нет</h2>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Проверили <span className="tabular">{total}</span>{' '}
          {plural(total, 'строку', 'строки', 'строк')} — всё на месте.
        </p>
        <Button variant="primary" className="mt-5" onClick={onDone}>
          Вернуться к выпуску
        </Button>
      </div>
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
    <div className="border-b border-[var(--line)] bg-[var(--surface)]">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3">
        <Stat value={report.clean} label="без замечаний" tone="ok" />
        {report.blocked > 0 && <Stat value={report.blocked} label="нельзя выпускать" tone="bad" />}
        {warnings > 0 && <Stat value={warnings} label="стоит посмотреть" tone="warn" />}

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={onRecheck} disabled={busy}>
            {busy ? <LoaderCircle size={14} className="animate-spin" /> : null}
            Проверить заново
          </Button>
          {report.blocked > 0 ? (
            /*
             * Кнопка снимает отметки и на этом останавливается — выпуск
             * человек запускает сам на вкладке получателей. Прежнее
             * «Выпустить только чистые» обещало выпуск, которого не было:
             * человек нажимал, видел, что список поредел, и уходил в полной
             * уверенности, что грамоты создаются.
             */
            <Button size="sm" variant="primary" onClick={onUncheckBlocked} disabled={busy}>
              Снять отметки с проблемных строк: {report.blocked}
            </Button>
          ) : (
            <Button size="sm" variant="primary" onClick={onDone} disabled={busy}>
              Вернуться к выпуску
            </Button>
          )}
        </div>
      </div>

      <QuotaLine quota={report.quota} />
      <Caveats items={report.caveats} />
    </div>
  );
}

function Stat({ value, label, tone }: { value: number; label: string; tone: 'ok' | 'warn' | 'bad' }) {
  const colors = {
    ok: 'text-[var(--accent)]',
    warn: 'text-[var(--award)]',
    bad: 'text-[var(--danger)]',
  } as const;
  return (
    <span className="flex items-baseline gap-1.5">
      <span className={`tabular text-lg font-medium ${colors[tone]}`}>{value}</span>
      <span className="text-sm text-[var(--text-muted)]">{label}</span>
    </span>
  );
}

/**
 * Квота — до выпуска, а не после.
 *
 * Узнать об исчерпанной пробе на сорок седьмом документе из пятидесяти —
 * это уже испорченное награждение, и здесь у нас последняя возможность
 * сказать об этом заранее.
 */
function QuotaLine({ quota }: { quota: BatchValidation['quota'] }) {
  if (quota.plan === 'paid' || quota.limit === null) return null;

  const left = quota.left ?? 0;

  if (quotaFits(quota)) {
    return (
      <p className="border-t border-[var(--line)] px-4 py-2 text-sm text-[var(--text-muted)]">
        Бесплатная проба: останется <span className="tabular">{left - quota.adding}</span> из{' '}
        <span className="tabular">{quota.limit}</span> документов.
      </p>
    );
  }

  /*
   * Не хватает — так и пишем.
   *
   * Никакой доплаты здесь не предлагается: выпуска сверх предела в сервисе
   * нет, кнопка «Создать документы» на этом же наборе строк ответит отказом.
   * Раньше тут стояло «сверх лимита N документов по 3 ₽» — обещание,
   * которого продукт не выполняет, и человек упирался в отказ уже после того,
   * как поверил проверке.
   */
  return (
    <p className="flex flex-wrap items-baseline gap-x-1.5 border-t border-[var(--line)] bg-[var(--award-soft)] px-4 py-2 text-sm">
      <TriangleAlert size={14} className="self-center text-[var(--award)]" />
      <span>
        Отмечено <span className="tabular font-medium">{quota.adding}</span>{' '}
        {plural(quota.adding, 'строка', 'строки', 'строк')}, а на бесплатной пробе доступно{' '}
        <span className="tabular font-medium">{left}</span>{' '}
        {plural(left, 'документ', 'документа', 'документов')} из{' '}
        <span className="tabular">{quota.limit}</span>. Выпуск не начнётся: снимите лишние
        отметки или выберите тариф.
      </span>
    </p>
  );
}

/**
 * Чего проверка не знает.
 *
 * Показываем, а не прячем. Проверка, молчащая о своих границах, внушает
 * больше доверия, чем заслуживает, — и человек перестаёт смотреть грамоты
 * сам, положившись на неё там, где она не отвечает.
 */
function Caveats({ items }: { items: string[] }) {
  const [open, setOpen] = useState(false);
  if (!items.length) return null;

  return (
    <div className="border-t border-[var(--line)] px-4 py-2">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text)]"
      >
        <Info size={13} />
        Что проверка не смотрела ({items.length})
        <ChevronRight size={13} className={open ? 'rotate-90 transition-transform' : 'transition-transform'} />
      </button>
      {open && (
        <ul className="mt-2 space-y-1 pl-5 text-xs text-[var(--text-muted)]">
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
    <div className="flex flex-wrap gap-1.5 border-b border-[var(--line)] px-4 py-2">
      <Chip active={value === 'all'} onClick={() => onChange('all')}>
        Все замечания ({report.rows.length})
      </Chip>
      {counts.map(([code, count]) => (
        <Chip key={code} active={value === code} onClick={() => onChange(code)}>
          {PROBLEM_KINDS[code].title} ({count})
        </Chip>
      ))}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-2.5 py-1 text-xs transition-colors ${
        active
          ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
          : 'bg-[var(--surface-sunken)] text-[var(--text-muted)] hover:text-[var(--text)]'
      }`}
    >
      {children}
    </button>
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
    () =>
      filter === 'all'
        ? report.rows
        : report.rows.filter((r) => r.problems.some((p) => p.code === filter)),
    [report, filter],
  );

  /**
   * Одинаковые правки во всём списке — то, ради чего экран и нужен.
   *
   * «ФИО прописными» в выгрузке из протокола встречается не в одной строке,
   * а во всех трёхстах, и чинить их по одной — это ровно тот ручной труд,
   * от которого сервис избавляет.
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
      {/* Предложения, применимые сразу ко многим строкам. */}
      {[...bulk].filter(([, fixes]) => fixes.length > 1).map(([code, fixes]) => (
        <div
          key={code}
          className="flex flex-wrap items-center gap-2 border-b border-[var(--line)] bg-[var(--accent-soft)] px-4 py-2 text-sm"
        >
          <Wand2 size={15} className="text-[var(--accent)]" />
          <span>
            «{PROBLEM_KINDS[code].title}» — в {fixes.length}{' '}
            {plural(fixes.length, 'строке', 'строках', 'строках')}. Исправление
            подставляется однозначно.
          </span>
          <Button
            size="sm"
            variant="primary"
            className="ml-auto"
            disabled={busy}
            onClick={() => onFix(fixes)}
          >
            Исправить все {fixes.length}
          </Button>
        </div>
      ))}

      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-[var(--surface-sunken)] text-left">
          <tr className="text-xs tracking-wide text-[var(--text-muted)] uppercase">
            {/* Имя занимает больше номера: по нему строку и узнают в лицо,
                а в три строки завёрнутое «Иванов Пётр Ильич» не читается. */}
            <th className="w-56 px-4 py-2 font-medium">Строка</th>
            <th className="w-44 px-3 py-2 font-medium">Проблема</th>
            <th className="px-3 py-2 font-medium">Причина</th>
            <th className="w-64 px-3 py-2 font-medium">Что сделать</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, shown).map((row) => (
            <RowBlock
              key={row.rowId}
              row={row}
              busy={busy}
              onFix={onFix}
              onExclude={() => onExclude([row.rowId])}
            />
          ))}
        </tbody>
      </table>

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
        <tr
          key={`${problem.code}-${index}`}
          className={`border-b border-[var(--line)] align-top ${
            index === 0 ? '' : 'border-t-0'
          }`}
        >
          {/* Номер и имя пишем один раз на строку списка, а не на каждое
              её замечание: иначе таблица читается как перечень повторов. */}
          {index === 0 ? (
            <td className="px-4 py-2.5" rowSpan={row.problems.length}>
              <span className="tabular font-medium">{row.position}</span>
              <span className="mt-0.5 block text-xs break-words text-[var(--text-muted)]">
                {row.title}
              </span>
            </td>
          ) : null}

          <td className="px-3 py-2.5">
            <ProblemBadge code={problem.code} />
          </td>

          <td className="px-3 py-2.5">
            <span className="block break-words">{problem.detail}</span>
            <span className="mt-0.5 block text-xs text-[var(--text-muted)]">
              {PROBLEM_KINDS[problem.code].consequence}
            </span>
          </td>

          <td className="px-3 py-2.5">
            <Action
              row={row}
              problem={problem}
              busy={busy}
              onFix={onFix}
              onExclude={index === 0 ? onExclude : undefined}
            />
          </td>
        </tr>
      ))}
    </>
  );
}

function ProblemBadge({ code }: { code: ProblemCode }) {
  const kind = PROBLEM_KINDS[code];
  const blocking = kind.severity === 'blocker';
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium ${
        blocking
          ? 'bg-[var(--danger-soft)] text-[var(--danger)]'
          : 'bg-[var(--award-soft)] text-[var(--award)]'
      }`}
    >
      {blocking ? <CircleAlert size={12} /> : <TriangleAlert size={12} />}
      {kind.title}
    </span>
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

  if (editing) {
    return (
      <div className="flex items-center gap-1.5">
        <Input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setEditing(false);
            if (e.key === 'Enter') {
              onFix([{ rowId: row.rowId, column: problem.column!, value }]);
              setEditing(false);
            }
          }}
          className="py-1 text-sm"
          aria-label={`Новое значение колонки «${problem.column}»`}
        />
        <Button
          size="sm"
          variant="primary"
          disabled={busy}
          onClick={() => {
            onFix([{ rowId: row.rowId, column: problem.column!, value }]);
            setEditing(false);
          }}
        >
          ОК
        </Button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          aria-label="Отменить правку"
          className="text-[var(--text-muted)] hover:text-[var(--text)]"
        >
          <X size={16} />
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {problem.suggestion && (
        <Button
          size="sm"
          variant="primary"
          disabled={busy}
          onClick={() =>
            onFix([{ rowId: row.rowId, column: problem.column!, value: problem.suggestion! }])
          }
          title={`Заменить на «${problem.suggestion}»`}
        >
          <Wand2 size={13} />
          <span className="max-w-40 truncate">{problem.suggestion}</span>
        </Button>
      )}
      <Button size="sm" disabled={busy} onClick={() => setEditing(true)}>
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
