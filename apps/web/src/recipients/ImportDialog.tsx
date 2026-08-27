import { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import type { ParsedSheet } from '../api/recipients';
import { Button } from '../ui/Button';
import { Input, Label } from '../ui/Field';

interface Props {
  sheet: ParsedSheet;
  existingColumns: string[];
  importing: boolean;
  onCancel: () => void;
  onConfirm: (columns: string[], rows: string[][], mode: 'append' | 'replace') => void;
}

/**
 * Предпросмотр разобранного файла. Пользователь видит, что именно распознано,
 * и правит сопоставление колонок до того, как что-то попадёт в базу:
 * молча импортировать чужой файл «как понял» — верный способ испортить таблицу.
 */
export function ImportDialog({
  sheet,
  existingColumns,
  importing,
  onCancel,
  onConfirm,
}: Props) {
  const [names, setNames] = useState(sheet.columns.map((c) => c.suggested));
  const [mode, setMode] = useState<'append' | 'replace'>('append');

  const duplicates = names.filter((n, i) => n && names.indexOf(n) !== i);
  const invalid = names.filter((n) => n && !/^[a-zA-Z][a-zA-Z0-9_]*$/.test(n));
  const canConfirm = !duplicates.length && !invalid.length && names.every(Boolean);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl bg-[var(--surface)] ring-1 ring-[var(--line)]">
        <header className="flex items-center gap-3 border-b border-[var(--line)] px-5 py-4">
          <h2 className="text-lg font-semibold">Проверьте, что распознано</h2>
          <span className="text-sm text-[var(--text-muted)]">
            {sheet.sheetName && `лист «${sheet.sheetName}» · `}
            строк: {sheet.rows.length}
          </span>
          <button
            onClick={onCancel}
            aria-label="Закрыть"
            className="ml-auto rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-sunken)]"
          >
            <X size={18} />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {/*
            Протокол соревнований показываем отдельно от обычной таблицы:
            группы — главное, что нужно проверить глазами перед импортом.
            Ошибка в разбиении на группы означает, что первых мест окажется
            одно вместо восьми, и заметят это уже на награждении.
          */}
          {sheet.protocol && sheet.protocol.groups.length > 0 && (
            <div className="rounded-lg bg-[var(--accent-soft)] px-3 py-2.5 text-sm text-[var(--accent)]">
              <p className="font-medium">Распознан протокол соревнований</p>
              <ul className="mt-1 space-y-0.5">
                {sheet.protocol.groups.map((g) => (
                  <li key={g.title}>
                    {g.title} — строк: {g.rowCount}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {sheet.warnings.length > 0 && (
            <ul className="space-y-1 rounded-lg bg-[var(--award-soft)] px-3 py-2.5 text-sm text-[var(--award)]">
              {sheet.warnings.map((w) => (
                <li key={w} className="flex gap-2">
                  <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                  {w}
                </li>
              ))}
            </ul>
          )}

          <div>
            <Label>Колонки файла и имена переменных</Label>
            <div className="space-y-2">
              {sheet.columns.map((col, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="w-1/2 truncate text-sm" title={col.source}>
                    {col.source}
                  </span>
                  <span className="text-[var(--text-muted)]">→</span>
                  <Input
                    value={names[i]}
                    onChange={(e) =>
                      setNames((prev) => prev.map((n, j) => (j === i ? e.target.value : n)))
                    }
                    className="w-1/2 font-mono text-sm"
                  />
                  {existingColumns.includes(names[i]) && (
                    <span className="shrink-0 text-xs text-[var(--text-muted)]">уже есть</span>
                  )}
                </div>
              ))}
            </div>
            {duplicates.length > 0 && (
              <p className="mt-2 text-sm text-[var(--danger)]">
                Имена переменных повторяются: {[...new Set(duplicates)].join(', ')}
              </p>
            )}
            {invalid.length > 0 && (
              <p className="mt-2 text-sm text-[var(--danger)]">
                Латинские буквы, цифры и подчёркивание; первым символом — буква
              </p>
            )}
          </div>

          <div>
            <Label>Первые строки</Label>
            <div className="overflow-x-auto rounded-lg ring-1 ring-[var(--line)]">
              <table className="w-full text-sm">
                <thead className="bg-[var(--surface-sunken)]">
                  <tr>
                    {names.map((n, i) => (
                      <th key={i} className="px-3 py-2 text-left font-mono text-xs font-medium">
                        {n}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sheet.rows.slice(0, 5).map((row, i) => (
                    <tr key={i} className="border-t border-[var(--line)]">
                      {row.map((cell, j) => (
                        <td key={j} className="max-w-48 truncate px-3 py-1.5">
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <footer className="flex items-center gap-3 border-t border-[var(--line)] px-5 py-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={mode === 'replace'}
              onChange={(e) => setMode(e.target.checked ? 'replace' : 'append')}
              className="accent-[var(--accent)]"
            />
            Заменить существующие строки
          </label>
          <div className="ml-auto flex gap-2">
            <Button onClick={onCancel}>Отмена</Button>
            <Button
              variant="primary"
              disabled={!canConfirm || importing}
              onClick={() => onConfirm(names, sheet.rows, mode)}
            >
              {importing ? 'Импортируем…' : `Импортировать ${sheet.rows.length}`}
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
}
