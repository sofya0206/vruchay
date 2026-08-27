import { useMemo, useState } from 'react';
import { AlertTriangle, Wand2, X } from 'lucide-react';
import type { ParsedSheet } from '../api/recipients';
import { Button } from '../ui/Button';
import { Input, Label } from '../ui/Field';

/**
 * Предложение по чистке значений: разбор находит капслок и кириллицу
 * в латинском адресе, но ничего не меняет сам — правку подтверждают здесь.
 * Готовые значения колонки приходят вместе с предложением, поэтому правила
 * написания фамилий живут на сервере в одном месте.
 */
export interface ImportSuggestion {
  kind: 'uppercase' | 'email-homoglyph';
  column: number;
  columnTitle: string;
  count: number;
  before: string;
  after: string;
  values: string[];
}

export type ParsedSheetWithSuggestions = ParsedSheet & { suggestions?: ImportSuggestion[] };

/** Строки с принятыми правками. Непринятые предложения строк не касаются. */
export function applySuggestions(
  rows: string[][],
  suggestions: ImportSuggestion[],
  accepted: number[],
): string[][] {
  if (!accepted.length) return rows;
  const fixed = rows.map((row) => [...row]);
  for (const index of accepted) {
    const suggestion = suggestions[index];
    if (!suggestion) continue;
    fixed.forEach((row, i) => {
      const value = suggestion.values[i];
      if (value !== undefined) row[suggestion.column] = value;
    });
  }
  return fixed;
}

interface Props {
  sheet: ParsedSheetWithSuggestions;
  existingColumns: string[];
  importing: boolean;
  /** Откуда взяты строки — файл или вставка из буфера. */
  source?: 'file' | 'paste';
  onCancel: () => void;
  onConfirm: (columns: string[], rows: string[][], mode: 'append' | 'replace') => void;
}

const SUGGESTION_TITLE: Record<ImportSuggestion['kind'], (s: ImportSuggestion) => string> = {
  uppercase: (s) => `Привести «${s.columnTitle}» из ЗАГЛАВНЫХ к обычному виду`,
  'email-homoglyph': (s) => `Исправить русские буквы в латинских адресах «${s.columnTitle}»`,
};

/**
 * Какие именно буквы русские.
 *
 * Без этого предложение выглядит издевательством: «ivanov@mail.ru →
 * ivanov@mail.ru», потому что русская «о» от латинской на вид неотличима —
 * в том и беда. Замена идёт буква в букву, поэтому строки сравнимы напрямую.
 */
export function replacedLetters(before: string, after: string): string {
  const letters = new Set<string>();
  if (before.length === after.length) {
    for (let i = 0; i < before.length; i++) {
      if (before[i] !== after[i]) letters.add(before[i]);
    }
  }
  return [...letters].join(', ');
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
  source = 'file',
  onCancel,
  onConfirm,
}: Props) {
  const [names, setNames] = useState(sheet.columns.map((c) => c.suggested));
  const [mode, setMode] = useState<'append' | 'replace'>('append');
  // Предложения выключены по умолчанию: правку текста человек включает сам.
  const [accepted, setAccepted] = useState<number[]>([]);
  const suggestions = sheet.suggestions ?? [];

  const rows = useMemo(
    () => applySuggestions(sheet.rows, suggestions, accepted),
    [sheet.rows, suggestions, accepted],
  );

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
            {source === 'paste' && 'из буфера обмена · '}
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

          {/* Правку самих значений не делаем молча: «ИВАНОВ» превращать
              в «Иванов» решает тот, кто отвечает за список. */}
          {suggestions.length > 0 && (
            <div className="space-y-2 rounded-lg bg-[var(--surface-sunken)] px-3 py-2.5">
              {suggestions.map((suggestion, i) => (
                <label
                  key={`${suggestion.kind}-${suggestion.column}`}
                  className="flex gap-2 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={accepted.includes(i)}
                    onChange={(e) =>
                      setAccepted((prev) =>
                        e.target.checked ? [...prev, i] : prev.filter((j) => j !== i),
                      )
                    }
                    className="mt-0.5 accent-[var(--accent)]"
                  />
                  <span>
                    <span className="inline-flex items-center gap-1.5">
                      <Wand2 size={14} className="shrink-0 text-[var(--text-muted)]" />
                      {SUGGESTION_TITLE[suggestion.kind](suggestion)}
                    </span>
                    <span className="block text-[var(--text-muted)]">
                      ячеек: {suggestion.count} · {suggestion.before} → {suggestion.after}
                      {suggestion.kind === 'email-homoglyph' &&
                        replacedLetters(suggestion.before, suggestion.after) &&
                        ` · русские буквы: ${replacedLetters(suggestion.before, suggestion.after)}`}
                    </span>
                  </span>
                </label>
              ))}
            </div>
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
                  {rows.slice(0, 5).map((row, i) => (
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
              onClick={() => onConfirm(names, rows, mode)}
            >
              {importing ? 'Импортируем…' : `Импортировать ${sheet.rows.length}`}
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
}
