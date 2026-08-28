import { useEffect, useRef, useState } from 'react';
import {
  Ban,
  Download,
  Eye,
  FileUp,
  ListChecks,
  LoaderCircle,
  Play,
  Plus,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import {
  useGeneration,
  useJobFailures,
  useRecipientMutations,
  useRecipients,
  useSend,
  type HeaderChoice,
  type ParsedSheet,
  type SendResult,
} from '../api/recipients';
import { PreviewDialog } from './PreviewDialog';
import { Button } from '../ui/Button';
import { Input, StatusChip } from '../ui/Field';
import { ImportDialog } from './ImportDialog';
import { planPaste } from './clipboard';
import { GenerateDialog, type GenerateMode } from './GenerateDialog';
import { DownloadDialog } from './DownloadDialog';
import { InviteNudge } from '../referral/InviteNudge';

export function RecipientsTable({
  documentId,
  onGoToMail,
  onGoToRegistry,
  onGoToCheck,
}: {
  documentId: string;
  onGoToMail: () => void;
  onGoToRegistry: () => void;
  onGoToCheck: () => void;
}) {
  const table = useRecipients(documentId);
  const m = useRecipientMutations(documentId);
  const [jobId, setJobId] = useState<string | null>(null);
  const { job, start, cancel, resume } = useGeneration(documentId, jobId);
  const send = useSend(documentId);
  const [parsed, setParsed] = useState<ParsedSheet | null>(null);
  const [parsedFrom, setParsedFrom] = useState<'file' | 'paste'>('file');
  /*
   * Имена переменных, введённые руками в окне импорта.
   *
   * Переживают закрытие окна: файл переливают обычно потому, что в нём
   * что-то поправили, и заставлять человека второй раз переименовывать
   * те же колонки — значит наказывать его за исправление опечатки.
   * Ключ — заголовок колонки файла, поэтому переименование срабатывает
   * и на другом файле с такой же шапкой.
   */
  const [manualNames, setManualNames] = useState<Record<string, string>>({});
  const [newColumn, setNewColumn] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const [asking, setAsking] = useState(false);
  const [sent, setSent] = useState<SendResult | null>(null);
  const [downloading, setDownloading] = useState(false);
  // Отчёт об ошибках спрашиваем только когда есть о чём: лишний запрос
  // на каждый удачный выпуск не нужен никому.
  const failures = useJobFailures(jobId, (job?.failed ?? 0) > 0);

  /*
   * Рассылка запускается сама, когда выпуск закончился.
   *
   * Держим намерение в ref, а не в состоянии: оно не влияет на то, что
   * нарисовано, и лишняя перерисовка тут не нужна.
   *
   * `sentForJob` обязателен и защищает не от лишней перерисовки, а от
   * повторной рассылки: задание опрашивается по таймеру, и без этой отметки
   * каждый следующий ответ «готово» отправлял бы участникам письма заново.
   */
  const wantSend = useRef(false);
  const sentForJob = useRef<string | null>(null);

  /**
   * Незаконченные записи ячеек.
   *
   * Копится цепочкой: правок может быть несколько, а дождаться нужно всех.
   * Ошибку глотаем — о ней уже сообщит сама запись, а выпуск из-за неё
   * останавливать не за что.
   */
  /**
   * Файл, из которого разобран открытый диалог. Нужен, чтобы перечитать
   * его же, когда человек переключает понимание первой строки: вставку
   * из буфера второй раз не попросишь.
   */
  const parseSource = useRef<File | null>(null);

  const pendingSaves = useRef<Promise<unknown>>(Promise.resolve());
  const trackSave = (promise: Promise<unknown>) => {
    pendingSaves.current = Promise.all([pendingSaves.current, promise.catch(() => {})]);
  };

  /*
   * Вставка таблицы из Excel.
   *
   * Слушаем документ, а не таблицу: фокус во время Ctrl+V может быть
   * в ячейке, в поле новой колонки или нигде — событие вставки в этих
   * случаях приходит в разные места, а вести себя должно одинаково.
   *
   * Текст уходит в тот же разбор, что и файл: заголовки, кодировка,
   * пустые строки и чистка значений тогда работают одними правилами,
   * а не двумя похожими.
   */
  useEffect(() => {
    function onPaste(event: ClipboardEvent) {
      // Пока открыт диалог, вставка принадлежит ему.
      if (parsed || preview || asking) return;

      const plan = planPaste(event);
      if (plan.kind === 'ignore') return;

      event.preventDefault();
      if (plan.kind === 'too-big') {
        setError('Слишком большая вставка — сохраните список файлом и загрузите его');
        return;
      }
      void parseInto(plan.file, 'paste');
    }

    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [parsed, preview, asking, parseInto]);

  useEffect(() => {
    if (!job || job.status !== 'done' || job.done === 0) return;
    if (!wantSend.current || sentForJob.current === job.id) return;

    sentForJob.current = job.id;
    send.mutate(undefined, {
      onSuccess: (result) => setSent(result),
      onError: (err) => setError((err as Error).message),
    });
  }, [job?.id, job?.status, job?.done, send]);

  // Имена помним в пределах одного материала: у другого материала и таблица
  // другая, а одинаковая шапка там может значить другое.
  useEffect(() => setManualNames({}), [documentId]);

  if (table.isPending) return <p className="p-6 text-[var(--text-muted)]">Загрузка таблицы…</p>;
  if (!table.data) return <p className="p-6 text-[var(--text-muted)]">Таблица недоступна</p>;

  const { columns, rows, checkedCount } = table.data;
  const allChecked = rows.length > 0 && rows.every((r) => r.checked);
  // Задание стоит «в очереди», но за ним никто не пришёл: пакет не доехал
  // до очереди, и сам собой он не тронется. Сервис поднимет такое задание
  // сторожем в течение нескольких минут, но человеку у экрана незачем
  // ждать вслепую — он видит, что случилось, и может нажать «Продолжить».
  const stuck = job?.status === 'queued' && job.stuck === true;
  const running = !stuck && (job?.status === 'queued' || job?.status === 'running');
  // Доделывать есть что, пока сделано меньше обещанного.
  const canResume =
    !!job && (job.status === 'failed' || job.status === 'canceled' || stuck) && job.done < job.total;

  /**
   * Разбор для диалога. Один путь и для файла, и для вставки: правила
   * разбора у них общие, различается только то, откуда взялись байты.
   */
  async function parseInto(file: File, from: 'file' | 'paste', headers: HeaderChoice = 'auto') {
    setError(null);
    parseSource.current = file;
    try {
      const sheet = await m.parseFile.mutateAsync({ file, headers });
      setParsedFrom(from);
      setParsed(sheet);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function onGenerate(mode: GenerateMode) {
    setError(null);
    setSent(null);
    setAsking(false);
    wantSend.current = mode === 'files-and-send';
    try {
      // Ждём, пока долетят правки ячеек.
      //
      // Ячейка сохраняется при уходе из неё, а самый обычный путь —
      // дописать последнюю фамилию и сразу нажать «Создать документы».
      // Нажатие уводит фокус, запись уходит на сервер, но выпуск читает
      // строки уже на сервере — и в грамоте оказалась бы пустая фамилия.
      // Секунды здесь никто не заметит, а испорченную партию заметят все.
      await pendingSaves.current;

      const created = await start.mutateAsync();
      setJobId(created.id);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function onCancel() {
    if (!job) return;
    setError(null);
    // Рассылку отменённого пакета не запускаем: половина участников
    // получила бы письма, а половина — нет, и разобраться, кто именно,
    // было бы не по чему.
    wantSend.current = false;
    try {
      await cancel.mutateAsync(job.id);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  /**
   * Доделать прерванный выпуск.
   *
   * Не то же самое, что «Создать документы»: там новое задание и новая
   * оплата, а здесь доделывается то же самое, и за уже созданное второй раз
   * не списывается.
   */
  async function onResume() {
    if (!job) return;
    setError(null);
    try {
      await resume.mutateAsync(job.id);
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
              if (file) void parseInto(file, 'file');
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
            <StatusChip tone={running ? 'progress' : job.failed || stuck ? 'neutral' : 'done'}>
              {running ? (
                <>
                  <LoaderCircle size={13} className="animate-spin" />
                  {job.done} из {job.total}
                </>
              ) : stuck ? (
                <>Выпуск не начался</>
              ) : job.status === 'canceled' ? (
                <>Остановлено на {job.done}</>
              ) : (
                <>
                  Готово {job.done}
                  {job.failed > 0 && `, ошибок ${job.failed}`}
                </>
              )}
            </StatusChip>
          )}

          {/* Отменить можно, пока идёт. Пакет на тысячу строк печатается
              больше часа, и увидеть опечатку в макете на второй минуте —
              обычное дело: до сих пор оставалось только ждать. */}
          {running && (
            <Button
              size="sm"
              variant="danger"
              icon={<Ban size={15} />}
              disabled={cancel.isPending}
              onClick={() => void onCancel()}
            >
              {cancel.isPending ? 'Останавливаем…' : 'Отменить'}
            </Button>
          )}

          {/* Прерванный выпуск доделывается, а не начинается заново:
              иначе за уже созданные документы пришлось бы платить второй раз. */}
          {canResume && (
            <Button
              size="sm"
              variant="primary"
              icon={<Play size={15} />}
              disabled={resume.isPending}
              onClick={() => void onResume()}
            >
              {resume.isPending ? 'Продолжаем…' : 'Продолжить'}
            </Button>
          )}

          {job && job.done > 0 && job.status !== 'queued' && job.status !== 'running' && (
            <Button size="sm" icon={<Download size={15} />} onClick={() => setDownloading(true)}>
              Скачать
            </Button>
          )}

          {/* Посмотреть до выпуска: опечатка в макете, найденная после
              рассылки пятисот грамот, стоит несравнимо дороже. */}
          <Button
            size="sm"
            icon={<Eye size={15} />}
            disabled={checkedCount === 0}
            onClick={() => setPreview(true)}
          >
            Посмотреть
          </Button>

          {/* «Посмотреть» показывает одну грамоту, а бед в списке на триста
              человек глазами не увидеть: они прячутся в отдельных строках. */}
          <Button
            size="sm"
            icon={<ListChecks size={15} />}
            disabled={checkedCount === 0}
            onClick={onGoToCheck}
          >
            Проверить строки
          </Button>

          <Button
            variant="primary"
            size="sm"
            icon={running ? <LoaderCircle size={15} className="animate-spin" /> : <Sparkles size={15} />}
            disabled={running || checkedCount === 0}
            onClick={() => setAsking(true)}
          >
            {running ? 'Создаём' : `Создать документы ${checkedCount || ''}`}
          </Button>
        </div>
      </div>

      {/* Итог. Формулировка зависит от того, что человек выбрал: сказать
          «созданы, никому не отправлены» тому, кто только что нажал
          «создать и разослать», — значит напугать без причины. */}
      {job?.status === 'done' && job.done > 0 && (
        <div className="flex flex-wrap items-center gap-3 border-b border-[var(--line)] bg-[var(--accent-soft)] px-4 py-3 text-sm">
          {send.isPending ? (
            <span className="flex items-center gap-2">
              <LoaderCircle size={14} className="animate-spin" />
              Документы созданы: <span className="tabular font-medium">{job.done}</span>.
              Отправляем письма…
            </span>
          ) : sent ? (
            <>
              <span>
                Отправлено писем: <span className="tabular font-medium">{sent.queued}</span>
                {sent.skipped.length > 0 && (
                  <>
                    , пропущено <span className="tabular font-medium">{sent.skipped.length}</span>
                  </>
                )}
              </span>
              <button
                onClick={onGoToRegistry}
                className="rounded-lg bg-[var(--surface)] px-2.5 py-1.5 ring-1 ring-[var(--line-strong)] hover:bg-[var(--surface-sunken)]"
              >
                Смотреть доставку
              </button>
            </>
          ) : (
            <>
              <span>
                Документы созданы: <span className="tabular font-medium">{job.done}</span>. Они
                пока никому не отправлены.
              </span>
              <button
                onClick={() => setDownloading(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--surface)] px-2.5 py-1.5 ring-1 ring-[var(--line-strong)] hover:bg-[var(--surface-sunken)]"
              >
                <Download size={14} />
                Скачать себе
              </button>
            </>
          )}
        </div>
      )}

      {/* Зависшее задание. Без этой строчки человек видел вечный прогресс
          и не знал ни что случилось, ни что делать: «Продолжить» такое
          задание не принимало, а помогало только «Отменить». */}
      {stuck && (
        <div className="border-b border-[var(--line)] bg-[var(--surface-sunken)] px-4 py-3 text-sm">
          Выпуск так и не начался: очередь заданий не приняла пакет. Ничего не списано —
          нажмите «Продолжить», и документы создадутся с того же места.
        </div>
      )}

      {/* Итог отмены. Главное здесь — что сделанное осталось и что
          за ненапечатанное никто не заплатил: без этой строчки отмена
          выглядит потерей всего пакета, и её боятся нажимать. */}
      {job?.status === 'canceled' && (
        <div className="flex flex-wrap items-center gap-3 border-b border-[var(--line)] bg-[var(--surface-sunken)] px-4 py-3 text-sm">
          <span>
            Выпуск остановлен. Успели создать:{' '}
            <span className="tabular font-medium">{job.done}</span> из{' '}
            <span className="tabular">{job.total}</span> — они сохранены.
            {job.total - job.done - job.failed > 0 && (
              <>
                {' '}
                За оставшиеся{' '}
                <span className="tabular font-medium">{job.total - job.done - job.failed}</span>{' '}
                документов ничего не списано — выпуск можно продолжить с того же места.
              </>
            )}
          </span>
          {job.done > 0 && (
            <button
              onClick={() => setDownloading(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--surface)] px-2.5 py-1.5 ring-1 ring-[var(--line-strong)] hover:bg-[var(--surface-sunken)]"
            >
              <Download size={14} />
              Скачать созданные
            </button>
          )}
        </div>
      )}

      {/* Просим рассказать о сервисе ровно здесь — сразу под сообщением
          об удачном выпуске, пока человек видит результат. */}
      {job?.status === 'done' && job.failed === 0 && <InviteNudge documentsMade={job.done} />}

      {/* Кого не осилил сам выпуск — поимённо и по той же причине:
          «ошибок 12» заставляет сверять список руками, а по числу не понять
          даже, пропали это строки из таблицы или не отрисовались документы. */}
      {(job?.failed ?? 0) > 0 && (failures.data?.length ?? 0) > 0 && (
        <details className="border-b border-[var(--line)] px-4 py-2 text-sm">
          <summary className="cursor-pointer text-[var(--text-muted)]">
            Кому документ не создался: {job!.failed}
          </summary>
          <ul className="mt-2 space-y-1">
            {failures.data!.map((f) => (
              <li key={f.rowId}>
                <span className="font-medium">{f.name}</span>
                <span className="text-[var(--text-muted)]"> — {f.reason}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* Кого рассылка обошла — поимённо. Число «пропущено 12» заставляет
          сверять список руками, а причина у каждого своя. */}
      {sent && sent.skipped.length > 0 && (
        <details className="border-b border-[var(--line)] px-4 py-2 text-sm">
          <summary className="cursor-pointer text-[var(--text-muted)]">
            Кому письмо не ушло: {sent.skipped.length}
          </summary>
          <ul className="mt-2 space-y-1">
            {sent.skipped.map((s, i) => (
              <li key={i}>
                <span className="font-medium">{s.name}</span>
                <span className="text-[var(--text-muted)]"> — {s.reason}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

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
                шапку и лишние строки сервис распознает сам. Или скопируйте таблицу
                в Excel и вставьте сюда через Ctrl+V.
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
                {/* Заголовок — по-человечески, переменная под ним мелким.
                    Раньше колонки назывались «%name» и «%email»: для
                    секретаря федерации это не название столбца, а шифр.
                    Переменную всё равно показываем — она нужна, когда
                    человек вписывает её в макет. */}
                {columns.map((col) => (
                  <th
                    key={col.id}
                    className="group border-b border-[var(--line)] px-3 py-2 text-left text-sm font-medium"
                  >
                    <span className="inline-flex items-center gap-1.5">
                      {columnTitle(col.name)}
                      <button
                        onClick={() => m.deleteColumn.mutate(col.id)}
                        aria-label={`Удалить колонку ${columnTitle(col.name)}`}
                        className="opacity-0 transition-opacity group-hover:opacity-100 hover:text-[var(--danger)]"
                      >
                        <X size={12} />
                      </button>
                    </span>
                    <span className="block font-mono text-xs font-normal text-[var(--text-muted)]">
                      %{col.name}
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
                            trackSave(
                              m.updateRow.mutateAsync({
                                rowId: row.id,
                                data: { [col.name]: value },
                              }),
                            );
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
          // Перечитанный лист — это другой разбор: имена колонок и принятые
          // предложения от прежнего к нему не относятся, диалог начинается заново.
          key={parsed.headerMode}
          sheet={parsed}
          existingColumns={columns.map((c) => c.name)}
          importing={m.importRows.isPending}
          source={parsedFrom}
          reparsing={m.parseFile.isPending}
          onHeaderMode={(headers) => {
            const file = parseSource.current;
            if (file) void parseInto(file, parsedFrom, headers);
          }}
          remembered={manualNames}
          onRemember={(key, name) => setManualNames((prev) => ({ ...prev, [key]: name }))}
          onCancel={() => setParsed(null)}
          onConfirm={(cols, importRows, mode) => {
            m.importRows.mutate(
              { columns: cols, rows: importRows, mode },
              { onSuccess: () => setParsed(null), onError: (e) => setError((e as Error).message) },
            );
          }}
        />
      )}

      {preview && (
        <PreviewDialog
          documentId={documentId}
          rows={rows.filter((r) => r.checked)}
          onClose={() => setPreview(false)}
        />
      )}

      {downloading && job && (
        <DownloadDialog
          jobId={job.id}
          count={job.done}
          columns={columns.map((c) => c.name)}
          onClose={() => setDownloading(false)}
        />
      )}

      {asking && (
        <GenerateDialog
          documentId={documentId}
          rows={rows.filter((r) => r.checked)}
          onCancel={() => setAsking(false)}
          onConfirm={(mode) => void onGenerate(mode)}
          onGoToMail={() => {
            setAsking(false);
            onGoToMail();
          }}
        />
      )}
    </div>
  );
}

/**
 * Название колонки по-человечески.
 *
 * Служебные имена придумали мы, и в макет их вписывать удобно, но в шапке
 * таблицы «%name» — не название столбца, а шифр. Своим колонкам организация
 * даёт имена сама, и их показываем как есть.
 */
function columnTitle(name: string): string {
  const known: Record<string, string> = {
    name: 'ФИО',
    email: 'Адрес почты',
  };
  return known[name] ?? name;
}
