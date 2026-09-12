import { useEffect, useRef, useState } from 'react';
import {
  Ban,
  CheckCircle2,
  CircleHelp,
  Columns3,
  Download,
  Eye,
  FileSpreadsheet,
  FileUp,
  ListChecks,
  ListX,
  LoaderCircle,
  Mail,
  Play,
  Plus,
  Rows3,
  ShieldCheck,
  Sparkles,
  Table2,
  Trash2,
  X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  useGeneration,
  useJobFailures,
  useRecipientMutations,
  useRecipients,
  useSend,
  type HeaderChoice,
  type ParsedSheet,
  type RecipientColumn,
  type SendResult,
} from '../api/recipients';
import { PreviewDialog } from './PreviewDialog';
import { Button } from '../ui/Button';
import { Input, Label, StatusChip } from '../ui/Field';
import { ImportDialog } from './ImportDialog';
import { planPaste } from './clipboard';
import { GenerateDialog, type GenerateMode } from './GenerateDialog';
import { DownloadDialog } from './DownloadDialog';
import { InviteNudge } from '../referral/InviteNudge';
import { DocumentChrome, ToolButton, ToolDivider } from '../editor/DocumentChrome';
import { useDocumentFileMenu } from '../editor/DocumentFileMenu';
import type { MenuDef } from '../editor/MenuBar';
import { Dialog } from '../mailing/Dialog';
import type { DocumentDetail } from '../api/types';
import type { WorkspaceTab } from '../mailing/workspace-tabs';
import { Checkbox } from '../ui/Checkbox';

/**
 * Таблица получателей — вторая сторона материала.
 *
 * Рамку рисует сама: название, меню и переключатель «Редактор — Таблица»
 * должны стоять на том же месте, что и над листом, иначе переход между
 * ними читается как уход в другой раздел. Всё, что относится к списку —
 * загрузка файла, отметки, выпуск, — живёт в её меню и на её панели.
 */
export function RecipientsTable({
  doc,
  onOpen,
  onIssue,
  startIssue = false,
  onIssueStarted,
  onGoToRegistry,
}: {
  doc: DocumentDetail;
  /** Переход к соседнему экрану материала: правила, проверка, письмо. */
  onOpen: (tab: WorkspaceTab) => void;
  /** «Выпустить» из таблицы: ведёт по шагам выпуска, а не открывает окно сразу. */
  onIssue: () => void;
  /** Шаги пройдены — открыть окно выпуска сразу при показе таблицы. */
  startIssue?: boolean;
  onIssueStarted?: () => void;
  onGoToRegistry: () => void;
}) {
  const documentId = doc.id;
  const navigate = useNavigate();
  const fileMenu = useDocumentFileMenu(doc);
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
  /** Открыто ли окно новой колонки: поле переехало из панели в меню «Вставка». */
  const [addingColumn, setAddingColumn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const [asking, setAsking] = useState(false);

  // Последний шаг выпуска вернул к таблице с просьбой открыть окно —
  // открываем и снимаем просьбу с адреса, чтобы она не повторилась
  // при обновлении страницы.
  useEffect(() => {
    if (!startIssue) return;
    setAsking(true);
    onIssueStarted?.();
  }, [startIssue]);
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

  /*
   * Выбор файла спрятан и живёт отдельно от меню: меню закрывается
   * по нажатию, а системное окно выбора должно открыться уже после этого.
   */
  const xlsInput = useRef<HTMLInputElement>(null);

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

  /* Во всю высоту: страница рисуется без оболочки кабинета, и короткая
     строчка на пустом экране читается как сломанная страница. */
  if (table.isPending)
    return (
      <div className="grid h-full place-items-center text-[var(--text-muted)]">
        Загрузка таблицы…
      </div>
    );
  if (!table.data)
    return (
      <div className="grid h-full place-items-center text-[var(--text-muted)]">
        Таблица недоступна
      </div>
    );

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
    !!job &&
    (job.status === 'failed' || job.status === 'canceled' || stuck) &&
    job.done < job.total;

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

  /*
   * Строка меню таблицы.
   *
   * «Правка» и «Вид» из настольных редакторов здесь не заведены: отменять
   * в таблице нечего — ячейка пишется на сервер по уходу из неё, а прятать
   * колонки сервис не умеет. Пункт, за которым нет действия, хуже
   * отсутствующего.
   */
  const menus: MenuDef[] = [
    { id: 'file', label: 'Файл', entries: fileMenu.entries },
    {
      id: 'insert',
      label: 'Вставка',
      entries: [
        {
          icon: <Rows3 size={16} />,
          label: 'Добавить строку',
          disabled: m.addRow.isPending,
          onSelect: () => m.addRow.mutate(),
        },
        {
          icon: <Columns3 size={16} />,
          label: 'Добавить колонку',
          onSelect: () => setAddingColumn(true),
        },
      ],
    },
    {
      id: 'data',
      label: 'Данные',
      entries: [
        {
          icon: <FileSpreadsheet size={16} />,
          label: m.parseFile.isPending ? 'Читаем файл…' : 'Загрузить файл XLS',
          disabled: m.parseFile.isPending,
          onSelect: () => xlsInput.current?.click(),
        },
        { separator: true },
        {
          icon: <CheckCircle2 size={16} />,
          label: 'Отметить все строки',
          disabled: rows.length === 0,
          onSelect: () => m.setChecked.mutate({ checked: true }),
        },
        {
          icon: <ListX size={16} />,
          label: 'Снять отметку со всех строк',
          disabled: rows.length === 0,
          onSelect: () => m.setChecked.mutate({ checked: false }),
        },
        { separator: true },
        {
          icon: <ListChecks size={16} />,
          label: 'Проверить строки',
          disabled: checkedCount === 0,
          onSelect: () => onOpen('check'),
        },
        {
          icon: <Sparkles size={16} />,
          label: 'Правила награждения',
          onSelect: () => onOpen('rules'),
        },
        {
          icon: <Mail size={16} />,
          label: 'Письмо участнику',
          onSelect: () => onOpen('mail'),
        },
        {
          icon: <ShieldCheck size={16} />,
          label: 'Подлинность документа',
          onSelect: () => onOpen('verify'),
        },
        { separator: true },
        {
          icon: <Table2 size={16} />,
          label: 'Выданное по материалу',
          onSelect: onGoToRegistry,
        },
      ],
    },
    {
      id: 'help',
      label: 'Справка',
      entries: [
        {
          icon: <CircleHelp size={16} />,
          label: 'Показать справку',
          onSelect: () => navigate('/docs'),
        },
      ],
    },
  ];

  /*
   * Панель значков под меню: то, чем пользуются каждый раз, — файл, строка,
   * колонка, взгляд на будущий документ. Остальное живёт в меню, а справа
   * стоит состояние выпуска: сколько отмечено и что с пакетом.
   */
  const toolbar = (
    <>
      <ToolButton
        title={m.parseFile.isPending ? 'Читаем файл…' : 'Загрузить список из файла'}
        disabled={m.parseFile.isPending}
        onClick={() => xlsInput.current?.click()}
      >
        {m.parseFile.isPending ? (
          <LoaderCircle size={16} className="animate-spin" />
        ) : (
          <FileUp size={16} />
        )}
      </ToolButton>
      <ToolButton
        title="Добавить строку"
        disabled={m.addRow.isPending}
        onClick={() => m.addRow.mutate()}
      >
        <Plus size={16} />
      </ToolButton>
      <ToolButton title="Добавить колонку" onClick={() => setAddingColumn(true)}>
        <Columns3 size={16} />
      </ToolButton>

      <ToolDivider />

      {/* Посмотреть до выпуска: опечатка в макете, найденная после
          рассылки пятисот грамот, стоит несравнимо дороже. */}
      <ToolButton
        title="Посмотреть будущий документ"
        disabled={checkedCount === 0}
        onClick={() => setPreview(true)}
      >
        <Eye size={16} />
      </ToolButton>
      {/* «Посмотреть» показывает одну грамоту, а бед в списке на триста
          человек глазами не увидеть: они прячутся в отдельных строках. */}
      <ToolButton
        title="Проверить строки"
        disabled={checkedCount === 0}
        onClick={() => onOpen('check')}
      >
        <ListChecks size={16} />
      </ToolButton>

      <div className="ml-auto flex items-center gap-2">
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
      </div>
    </>
  );

  return (
    /* Во всю высоту окна: страница таблицы рисуется сама по себе, без
       оболочки кабинета, и высоту ей задать больше некому. */
    <div className="flex h-full min-h-0 flex-col">
      <DocumentChrome
        documentId={documentId}
        title={doc.title}
        menus={menus}
        tab="table"
        toolbar={toolbar}
        action={
          <Button
            variant="primary"
            size="sm"
            icon={running ? <LoaderCircle size={15} className="animate-spin" /> : undefined}
            disabled={running || checkedCount === 0}
            onClick={onIssue}
          >
            {running ? 'Выпускаем' : `Выпустить ${checkedCount || ''}`}
          </Button>
        }
      />

      <input
        ref={xlsInput}
        type="file"
        accept=".xlsx,.csv,.txt,.tsv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void parseInto(file, 'file');
          e.target.value = '';
        }}
      />

      {/* Итог. Формулировка зависит от того, что человек выбрал: сказать
          «созданы, никому не отправлены» тому, кто только что нажал
          «создать и разослать», — значит напугать без причины. */}
      {job?.status === 'done' && job.done > 0 && (
        <div className="flex flex-wrap items-center gap-3 border-b border-[var(--line)] bg-[var(--accent-soft)] px-4 py-3 text-sm">
          {send.isPending ? (
            <span className="flex items-center gap-2">
              <LoaderCircle size={14} className="animate-spin" />
              Документы созданы: <span className="tabular font-medium">{job.done}</span>. Отправляем
              письма…
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
                Документы созданы: <span className="tabular font-medium">{job.done}</span>. Они пока
                никому не отправлены.
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
          Выпуск так и не начался: очередь заданий не приняла пакет. Ничего не списано — нажмите
          «Продолжить», и документы создадутся с того же места.
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
                <span className="tabular font-medium">
                  {job.total - job.done - job.failed}
                </span>{' '}
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
              <FileUp
                size={26}
                className="mx-auto mb-3 text-[var(--text-muted)]"
                strokeWidth={1.5}
              />
              <p className="font-medium">Список получателей пуст</p>
              <p className="mt-1 max-w-md text-sm text-[var(--text-muted)]">
                Загрузите файл Excel или CSV — подойдёт обычный список участников, шапку и лишние
                строки сервис распознает сам. Или скопируйте таблицу в Excel и вставьте сюда через
                Ctrl+V.
              </p>
              {/* Кнопка здесь обязательна: на панели значок без подписи,
                  и на пустом экране по нему не догадаться. */}
              <div className="mt-4 flex justify-center gap-2">
                <Button
                  variant="primary"
                  icon={<FileSpreadsheet size={15} />}
                  disabled={m.parseFile.isPending}
                  onClick={() => xlsInput.current?.click()}
                >
                  {m.parseFile.isPending ? 'Читаем файл…' : 'Загрузить файл'}
                </Button>
                <Button icon={<Plus size={15} />} onClick={() => m.addRow.mutate()}>
                  Добавить строку
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-[var(--surface-sunken)]">
              <tr>
                <th className="w-10 border-r border-b border-[var(--line)] px-3 py-2">
                  <Checkbox
                    checked={allChecked}
                    onChange={() => m.setChecked.mutate({ checked: !allChecked })}
                    aria-label="Отметить все"
                  />
                </th>
                {/* Номер строки — как в любой таблице: по нему называют место
                    ошибки («в двенадцатой опечатка»), и без него сверять
                    список с бумажным протоколом нечем. */}
                <th className="w-12 border-r border-b border-[var(--line)] px-2 py-2 text-right text-xs font-normal text-[var(--text-muted)]">
                  №
                </th>
                {/* Заголовок — по-человечески, переменная под ним мелким.
                    Раньше колонки назывались «%name» и «%email»: для
                    человека это не название столбца, а шифр.
                    Переменную всё равно показываем — она нужна, когда
                    человек вписывает её в макет. */}
                {columns.map((col) => (
                  <th
                    key={col.id}
                    className="group border-r border-b border-[var(--line)] px-3 py-2 text-left text-sm font-medium"
                  >
                    <span className="inline-flex items-center gap-1.5">
                      {columnTitle(col)}
                      <button
                        onClick={() => m.deleteColumn.mutate(col.id)}
                        aria-label={`Удалить колонку ${columnTitle(col)}`}
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
              {rows.map((row, index) => (
                <tr key={row.id} className="group hover:bg-[var(--surface-sunken)]/60">
                  <td className="border-r border-b border-[var(--line)] px-3 py-1 text-center">
                    <Checkbox
                      checked={row.checked}
                      onChange={() => m.updateRow.mutate({ rowId: row.id, checked: !row.checked })}
                      aria-label="Включить в генерацию"
                    />
                  </td>
                  <td className="tabular border-r border-b border-[var(--line)] px-2 py-1 text-right text-xs text-[var(--text-muted)]">
                    {index + 1}
                  </td>
                  {columns.map((col) => (
                    <td key={col.id} className="border-r border-b border-[var(--line)] p-0">
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
          onConfirm={(cols, importRows, mode, titles) => {
            m.importRows.mutate(
              { columns: cols, rows: importRows, titles, mode },
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
            onOpen('mail');
          }}
        />
      )}

      {/* Новая колонка — окном, а не полем на панели: панель под меню
          рассчитана на значки одного размера, и поле ввода в ней ломало
          строку каждый раз, когда название было длиннее слова. */}
      {addingColumn && (
        <Dialog
          title="Добавить колонку"
          onClose={() => setAddingColumn(false)}
          footer={
            <>
              <Button
                variant="primary"
                disabled={!newColumn.trim() || m.addColumn.isPending}
                onClick={() =>
                  m.addColumn.mutate(newColumn.trim(), {
                    onSuccess: () => {
                      setNewColumn('');
                      setAddingColumn(false);
                    },
                  })
                }
              >
                {m.addColumn.isPending ? 'Добавляем…' : 'Добавить'}
              </Button>
              <Button variant="ghost" onClick={() => setAddingColumn(false)}>
                Отмена
              </Button>
            </>
          }
        >
          <Label>Имя переменной</Label>
          <Input
            autoFocus
            value={newColumn}
            onChange={(e) => setNewColumn(e.target.value)}
            placeholder="team"
            className="font-mono"
            onKeyDown={(e) => {
              if (e.key !== 'Enter' || !newColumn.trim()) return;
              m.addColumn.mutate(newColumn.trim(), {
                onSuccess: () => {
                  setNewColumn('');
                  setAddingColumn(false);
                },
              });
            }}
          />
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            Так колонка будет называться в макете: напишете на листе %{newColumn.trim() || 'team'} —
            подставится её значение.
          </p>
        </Dialog>
      )}

      {fileMenu.dialogs}
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
/**
 * Что писать в шапке колонки.
 *
 * Сначала заголовок из загруженного файла: человек составлял таблицу сам
 * и ищет в шапке свои слова — «Год рождения», «Команда», «№». Служебные
 * `birth_year` и `team` он видит впервые и опознаёт колонку по значениям.
 *
 * Дальше — наши названия для двух колонок, которые заводит сам сервис,
 * и только потом имя переменной: у колонки, добавленной руками, другого
 * названия и нет.
 */
function columnTitle(column: RecipientColumn): string {
  const known: Record<string, string> = {
    name: 'ФИО',
    email: 'Адрес почты',
  };
  return column.title?.trim() || known[column.name] || column.name;
}
