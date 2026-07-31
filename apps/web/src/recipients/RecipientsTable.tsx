import { useState } from 'react';
import { Download, FileUp, LoaderCircle, Plus, Sparkles, Trash2, X } from 'lucide-react';
import {
  useGeneration,
  useRecipientMutations,
  useRecipients,
  type ParsedSheet,
} from '../api/recipients';
import { Button } from '../ui/Button';
import { Input, StatusChip } from '../ui/Field';
import { ImportDialog } from './ImportDialog';

export function RecipientsTable({ documentId }: { documentId: string }) {
  const table = useRecipients(documentId);
  const m = useRecipientMutations(documentId);
  const [jobId, setJobId] = useState<string | null>(null);
  const { job, start } = useGeneration(documentId, jobId);
  const [parsed, setParsed] = useState<ParsedSheet | null>(null);
  const [newColumn, setNewColumn] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (table.isPending) return <p className="p-6 text-[var(--text-muted)]">Загрузка таблицы…</p>;
  if (!table.data) return <p className="p-6 text-[var(--text-muted)]">Таблица недоступна</p>;

  const { columns, rows, checkedCount } = table.data;
  const allChecked = rows.length > 0 && rows.every((r) => r.checked);
  const running = job?.status === 'queued' || job?.status === 'running';

  async function onPickFile(file: File) {
    setError(null);
    try {
      setParsed(await m.parseFile.mutateAsync(file));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function onGenerate() {
    setError(null);
    try {
      const created = await start.mutateAsync();
      setJobId(created.id);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--line)] bg-[var(--surface)] px-4 py-2.5">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-[var(--surface)] px-2.5 py-1.5 text-sm ring-1 ring-[var(--line-strong)] transition-colors hover:bg-[var(--surface-sunken)]">
          <FileUp size={15} />
          {m.parseFile.isPending ? 'Читаем файл…' : 'Загрузить список'}
          <input
            type="file"
            accept=".xlsx,.csv,.txt,.tsv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void onPickFile(file);
              e.target.value = '';
            }}
          />
        </label>

        <Button size="sm" icon={<Plus size={15} />} onClick={() => m.addRow.mutate()}>
          Строка
        </Button>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (newColumn.trim()) {
              m.addColumn.mutate(newColumn.trim(), { onSuccess: () => setNewColumn('') });
            }
          }}
          className="flex gap-1"
        >
          <Input
            value={newColumn}
            onChange={(e) => setNewColumn(e.target.value)}
            placeholder="новая колонка"
            className="w-40 font-mono text-sm"
          />
          <Button size="sm" type="submit" disabled={!newColumn.trim()}>
            Добавить
          </Button>
        </form>

        <div className="ml-auto flex items-center gap-3">
          <span className="tabular text-sm text-[var(--text-muted)]">
            отмечено {checkedCount} из {rows.length}
          </span>

          {job && (
            <StatusChip tone={running ? 'progress' : job.failed ? 'neutral' : 'done'}>
              {running ? (
                <>
                  <LoaderCircle size={13} className="animate-spin" />
                  {job.done} из {job.total}
                </>
              ) : (
                <>
                  Готово {job.done}
                  {job.failed > 0 && `, ошибок ${job.failed}`}
                </>
              )}
            </StatusChip>
          )}

          {job?.status === 'done' && job.done > 0 && (
            <a
              href={`/api/jobs/${job.id}/archive`}
              className="inline-flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm ring-1 ring-[var(--line-strong)] transition-colors hover:bg-[var(--surface-sunken)]"
            >
              <Download size={15} />
              Скачать архив
            </a>
          )}

          <Button
            variant="primary"
            size="sm"
            icon={running ? <LoaderCircle size={15} className="animate-spin" /> : <Sparkles size={15} />}
            disabled={running || checkedCount === 0}
            onClick={onGenerate}
          >
            {running ? 'Создаём' : `Создать ${checkedCount || ''}`}
          </Button>
        </div>
      </div>

      {(error || job?.error) && (
        <p
          role="alert"
          className="flex items-center gap-2 bg-[var(--danger-soft)] px-4 py-2 text-sm text-[var(--danger)]"
        >
          {error ?? job?.error}
          <button onClick={() => setError(null)} aria-label="Скрыть">
            <X size={14} />
          </button>
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-auto">
        {rows.length === 0 ? (
          <div className="grid h-full place-items-center p-10 text-center">
            <div>
              <FileUp size={26} className="mx-auto mb-3 text-[var(--text-muted)]" strokeWidth={1.5} />
              <p className="font-medium">Список получателей пуст</p>
              <p className="mt-1 max-w-md text-sm text-[var(--text-muted)]">
                Загрузите файл Excel или CSV — подойдёт обычный протокол соревнования,
                шапку и лишние строки сервис распознает сам.
              </p>
            </div>
          </div>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-[var(--surface-sunken)]">
              <tr>
                <th className="w-10 border-b border-[var(--line)] px-3 py-2">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    onChange={() => m.setChecked.mutate({ checked: !allChecked })}
                    aria-label="Отметить все"
                    className="accent-[var(--accent)]"
                  />
                </th>
                {columns.map((col) => (
                  <th
                    key={col.id}
                    className="group border-b border-[var(--line)] px-3 py-2 text-left font-mono text-xs font-medium"
                  >
                    <span className="inline-flex items-center gap-1.5">
                      %{col.name}
                      <button
                        onClick={() => m.deleteColumn.mutate(col.id)}
                        aria-label={`Удалить колонку ${col.name}`}
                        className="opacity-0 transition-opacity group-hover:opacity-100 hover:text-[var(--danger)]"
                      >
                        <X size={12} />
                      </button>
                    </span>
                  </th>
                ))}
                <th className="w-10 border-b border-[var(--line)]" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="group hover:bg-[var(--surface-sunken)]/60">
                  <td className="border-b border-[var(--line)] px-3 py-1 text-center">
                    <input
                      type="checkbox"
                      checked={row.checked}
                      onChange={() =>
                        m.updateRow.mutate({ rowId: row.id, checked: !row.checked })
                      }
                      aria-label="Включить в генерацию"
                      className="accent-[var(--accent)]"
                    />
                  </td>
                  {columns.map((col) => (
                    <td key={col.id} className="border-b border-[var(--line)] p-0">
                      <input
                        defaultValue={row.data[col.name] ?? ''}
                        onBlur={(e) => {
                          const value = e.target.value;
                          if (value !== (row.data[col.name] ?? '')) {
                            m.updateRow.mutate({ rowId: row.id, data: { [col.name]: value } });
                          }
                        }}
                        className="w-full bg-transparent px-3 py-1.5 outline-none focus:bg-[var(--surface)] focus:ring-2 focus:ring-[var(--focus)]"
                      />
                    </td>
                  ))}
                  <td className="border-b border-[var(--line)] px-2 text-center">
                    <button
                      onClick={() => m.deleteRow.mutate(row.id)}
                      aria-label="Удалить строку"
                      className="text-[var(--text-muted)] opacity-0 transition-opacity group-hover:opacity-100 hover:text-[var(--danger)]"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {parsed && (
        <ImportDialog
          sheet={parsed}
          existingColumns={columns.map((c) => c.name)}
          importing={m.importRows.isPending}
          onCancel={() => setParsed(null)}
          onConfirm={(cols, importRows, mode) => {
            m.importRows.mutate(
              { columns: cols, rows: importRows, mode },
              { onSuccess: () => setParsed(null), onError: (e) => setError((e as Error).message) },
            );
          }}
        />
      )}
    </div>
  );
}
