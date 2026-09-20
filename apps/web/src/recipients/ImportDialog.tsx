import { useEffect, useMemo, useState } from 'react';
import { onboarding } from '../onboarding/store';
import { TriangleAlert, Wand2 } from 'lucide-react';
import type { ImportSuggestion, ParsedSheet } from '../api/recipients';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Checkbox } from '../ui/Checkbox';
import { Dialog } from '../ui/Dialog';
import { Input, Label } from '../ui/Field';
import { Segmented } from '../ui/Tabs';
import { Table, TBody, Td, Th, THead, Tr } from '../ui/Table';
import { Tooltip } from '../ui/Tooltip';
import { ICON, STROKE } from '../ui/icon';
import { cn } from '../ui/cn';
import {
  applyMerge,
  canMergeFullName,
  columnKey,
  countBound,
  initialNames,
  NAME_RE,
} from './column-mapping';

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
  sheet: ParsedSheet;
  existingColumns: string[];
  importing: boolean;
  /** Откуда взяты строки — файл или вставка из буфера. */
  source?: 'file' | 'paste';
  /** Идёт повторный разбор после переключения первой строки. */
  reparsing?: boolean;
  /** Перечитать файл, поняв первую строку иначе. */
  onHeaderMode?: (mode: 'headers' | 'none') => void;
  /** Имена, введённые руками при прошлой загрузке: ключ — заголовок колонки файла. */
  remembered: Record<string, string>;
  onRemember: (key: string, name: string) => void;
  onCancel: () => void;
  onConfirm: (
    columns: string[],
    rows: string[][],
    mode: 'append' | 'replace',
    /** Заголовки колонок из файла — они и станут шапкой таблицы получателей. */
    titles: string[],
  ) => void;
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

const HEADER_MODES = [
  { id: 'headers' as const, label: 'Заголовки' },
  { id: 'none' as const, label: 'Данные' },
];

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
  reparsing = false,
  onHeaderMode,
  remembered,
  onRemember,
  onCancel,
  onConfirm,
}: Props) {
  // Введённое руками сильнее догадки сервиса: если человек уже один раз
  // переименовал колонку «Участник» в свою переменную, повторная загрузка
  // того же файла не должна возвращать её к «name».
  const [names, setNames] = useState(() => initialNames(sheet.columns, remembered));
  // Окно увидели — в следующий раз точки у сопоставления уже нет.
  useEffect(() => () => onboarding.markSeen('import'), []);
  const [mode, setMode] = useState<'append' | 'replace'>('append');
  // Предложения выключены по умолчанию: правку текста человек включает сам.
  const [accepted, setAccepted] = useState<number[]>([]);
  const suggestions = sheet.suggestions ?? [];

  const rows = useMemo(
    () => applySuggestions(sheet.rows, suggestions, accepted),
    [sheet.rows, suggestions, accepted],
  );

  const [mergeFullName, setMergeFullName] = useState(false);

  const duplicates = names.filter((n, i) => n && names.indexOf(n) !== i);
  const invalid = names.filter((n) => n && !NAME_RE.test(n));
  const canConfirm = !duplicates.length && !invalid.length && names.every(Boolean);

  const canMerge = canMergeFullName(names);
  const result = applyMerge(
    names,
    rows,
    mergeFullName,
    sheet.columns.map((c) => c.source),
  );
  const bound = countBound(result.columns);

  return (
    <Dialog
      size="lg"
      title="Проверьте, что распознано"
      description={
        <>
          {sheet.sheetName && `лист «${sheet.sheetName}» · `}
          {source === 'paste' && 'из буфера обмена · '}
          строк: {sheet.rows.length}
        </>
      }
      onClose={onCancel}
      footer={
        <>
          <Checkbox
            className="mr-auto"
            checked={mode === 'replace'}
            onChange={(checked) => setMode(checked ? 'replace' : 'append')}
            label="Заменить существующие строки"
          />
          <Button variant="ghost" onClick={onCancel}>
            Отмена
          </Button>
          <Button
            variant="primary"
            disabled={!canConfirm}
            loading={importing}
            onClick={() => onConfirm(result.columns, result.rows, mode, result.titles)}
          >
            Импортировать {sheet.rows.length}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/*
          Переключатель первой строки.

          Из Excel копируют чаще всего выделенные данные, без строки заголовков,
          и тогда первый участник уезжает в названия колонок. Разбор такое
          замечает и говорит об этом, но последнее слово — за человеком:
          он видит предпросмотр и понимает, где чьё, лучше любой эвристики.
        */}
        {onHeaderMode && (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="text-muted">В первой строке</span>
            <Segmented
              items={HEADER_MODES}
              value={sheet.headerMode}
              onChange={(value) => {
                if (!reparsing && value !== sheet.headerMode) onHeaderMode(value);
              }}
              label="Что в первой строке"
            />
            {reparsing && <span className="text-muted">перечитываем…</span>}
          </div>
        )}

        {/*
          Протокол мероприятия показываем отдельно от обычной таблицы:
          группы — главное, что нужно проверить глазами перед импортом.
          Ошибка в разбиении на группы означает, что первых мест окажется
          одно вместо восьми, и заметят это уже на награждении.
        */}
        {sheet.protocol && sheet.protocol.groups.length > 0 && (
          <div className="rounded-card bg-accent-soft px-3 py-2.5 text-sm text-accent">
            <p className="font-medium">Распознан протокол мероприятия</p>
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
          <ul className="space-y-1 rounded-card bg-info-soft px-3 py-2.5 text-sm text-info">
            {sheet.warnings.map((w) => (
              <li key={w} className="flex gap-2">
                <TriangleAlert size={ICON.sm} strokeWidth={STROKE} className="mt-0.5 shrink-0" />
                {w}
              </li>
            ))}
          </ul>
        )}

        {/* Правку самих значений не делаем молча: «ИВАНОВ» превращать
            в «Иванов» решает тот, кто отвечает за список. */}
        {suggestions.length > 0 && (
          <div className="space-y-2 rounded-card bg-sunken px-3 py-2.5">
            {suggestions.map((suggestion, i) => (
              <Checkbox
                key={`${suggestion.kind}-${suggestion.column}`}
                checked={accepted.includes(i)}
                onChange={(checked) =>
                  setAccepted((prev) => (checked ? [...prev, i] : prev.filter((j) => j !== i)))
                }
                label={
                  <span className="inline-flex items-center gap-1.5">
                    <Wand2 size={ICON.sm} strokeWidth={STROKE} className="shrink-0 text-muted" />
                    {SUGGESTION_TITLE[suggestion.kind](suggestion)}
                  </span>
                }
                hint={
                  <>
                    ячеек: {suggestion.count} · {suggestion.before} → {suggestion.after}
                    {suggestion.kind === 'email-homoglyph' &&
                      replacedLetters(suggestion.before, suggestion.after) &&
                      ` · русские буквы: ${replacedLetters(suggestion.before, suggestion.after)}`}
                  </>
                }
              />
            ))}
          </div>
        )}

        <div>
          <div className="flex items-baseline justify-between gap-3">
            <Label>Колонки файла и имена переменных</Label>
            <span
              className={cn(
                'tabular text-sm',
                bound === result.columns.length ? 'text-muted' : 'text-danger',
              )}
            >
              Привязано {bound} из {result.columns.length}
            </span>
          </div>
          <Table
            dense
            stickyHeader={false}
            caption="Колонки файла и имена переменных"
            className="rounded-card ring-1 ring-line [&_tbody_tr:last-child>td]:border-b-0"
          >
            <THead>
              <tr>
                <Th width="50%">Колонка файла</Th>
                <Th>Переменная</Th>
                <Th />
              </tr>
            </THead>
            <TBody>
              {sheet.columns.map((col, i) => (
                <Tr key={i}>
                  <Td className="max-w-64 truncate" title={col.source}>
                    {col.source}
                  </Td>
                  <Td>
                    <Input
                      compact
                      aria-label={`Переменная для колонки ${col.source}`}
                      value={names[i]}
                      onChange={(e) =>
                        setNames((prev) => prev.map((n, j) => (j === i ? e.target.value : n)))
                      }
                      // Запоминаем на уходе из поля, а не на каждой букве: иначе
                      // в память попадали бы недописанные имена и пустая строка,
                      // оставшаяся после очистки поля.
                      onBlur={(e) => {
                        const value = e.target.value.trim();
                        if (value) onRemember(columnKey(sheet.columns, i), value);
                      }}
                      className="min-w-32 font-mono"
                    />
                  </Td>
                  <Td className="whitespace-nowrap">
                    {col.guessed && names[i] === col.suggested && (
                      <Tooltip label="Заголовок ничего не подсказал — имя подобрано по значениям в колонке. Проверьте его.">
                        <Badge tone="info" size="sm">
                          по данным
                        </Badge>
                      </Tooltip>
                    )}
                    {existingColumns.includes(names[i]) && (
                      <span className="text-xs text-muted">уже есть</span>
                    )}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
          {duplicates.length > 0 && (
            <p className="mt-2 text-sm text-danger">
              Имена переменных повторяются: {[...new Set(duplicates)].join(', ')}
            </p>
          )}
          {invalid.length > 0 && (
            <p className="mt-2 text-sm text-danger">
              Латинские буквы, цифры и подчёркивание; первым символом — буква
            </p>
          )}
          {names.some((n) => !n) && (
            <p className="mt-2 text-sm text-danger">
              Заполните имена всех колонок — пустых сервис не примет
            </p>
          )}
          {canMerge && (
            <Checkbox
              className="mt-3"
              checked={mergeFullName}
              onChange={setMergeFullName}
              label={
                <>
                  Склеить фамилию, имя и отчество в одну переменную{' '}
                  <code className="font-mono">name</code>
                </>
              }
              hint="В макете обычно одна строка с ФИО, а в файле три колонки"
            />
          )}
        </div>

        <div>
          <Label>Первые строки</Label>
          <Table
            dense
            stickyHeader={false}
            caption="Первые строки файла после сопоставления"
            className="rounded-card ring-1 ring-line [&_tbody_tr:last-child>td]:border-b-0"
          >
            <THead>
              <tr>
                {result.columns.map((n, i) => (
                  <Th key={i} className="font-mono">
                    {n}
                  </Th>
                ))}
              </tr>
            </THead>
            <TBody>
              {result.rows.slice(0, 5).map((row, i) => (
                <Tr key={i}>
                  {row.map((cell, j) => (
                    <Td key={j} className="max-w-48 truncate">
                      {cell}
                    </Td>
                  ))}
                </Tr>
              ))}
            </TBody>
          </Table>
        </div>
      </div>
    </Dialog>
  );
}
