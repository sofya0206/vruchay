import { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  Columns3,
  Eye,
  GripVertical,
  ListChecks,
  ListX,
  Plus,
  Rows3,
  Table2,
  Trash2,
  Upload,
  Users,
  Variable,
  X,
} from 'lucide-react';
import {
  useRecipientMutations,
  useRecipients,
  type HeaderChoice,
  type ParsedSheet,
  type RecipientColumn,
  type RecipientRow,
} from '../api/recipients';
import { errorText } from '../api/client';
import type { DocumentDetail } from '../api/types';
import { materialPath } from '../documents/material-steps';
import { DocumentChrome, ToolButton, ToolDivider, type MenuEntry } from '../editor/DocumentChrome';
import { FieldsSidebar } from '../editor/FieldsSidebar';
import { toggleFieldsPanel, useFieldsPanelOpen } from '../editor/fields-sidebar-store';
import { useDocumentFileMenu } from '../editor/DocumentFileMenu';
import type { WorkspaceTab } from '../mailing/workspace-tabs';
import { Button } from '../ui/Button';
import { Checkbox } from '../ui/Checkbox';
import { DesktopFirst } from '../ui/DesktopFirst';
import { Dialog } from '../ui/Dialog';
import { ErrorBar, ErrorState } from '../ui/ErrorState';
import { Field, Input } from '../ui/Field';
import { IconButton } from '../ui/IconButton';
import { Kbd } from '../ui/Kbd';
import { NextAction } from '../ui/NextAction';
import { SkeletonRows } from '../ui/Skeleton';
import { toast } from '../ui/Toast';
import { cn } from '../ui/cn';
import { ICON, STROKE } from '../ui/icon';
import { planPaste } from './clipboard';
import { ImportDialog } from './ImportDialog';
import { PreviewDialog } from './PreviewDialog';
import { RowOutcomeChip } from './RowOutcomeChip';

/**
 * Таблица получателей — шаг «Получатели» документа.
 *
 * Рамку рисует сама: название, лента шагов и меню должны стоять на том же
 * месте, что и над листом, иначе переход между шагами читается как уход
 * в другой раздел. Всё, что относится к списку — загрузка файла, отметки,
 * проверка, — живёт на её панели и в меню; сам выпуск — на шаге «Выпуск»,
 * куда ведёт главная кнопка рамки.
 */
export function RecipientsTable({
  doc,
  onOpen,
  onGoToRegistry,
}: {
  doc: DocumentDetail;
  /** Переход к соседнему экрану материала: правила, проверка, письмо. */
  onOpen: (tab: WorkspaceTab) => void;
  onGoToRegistry: () => void;
}) {
  const documentId = doc.id;
  const fileMenu = useDocumentFileMenu(doc);
  const fieldsOpen = useFieldsPanelOpen();
  const table = useRecipients(documentId);
  const m = useRecipientMutations(documentId);
  const [dragCol, setDragCol] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);

  /**
   * Перетаскивание колонки за ручку в шапке. Указательные события
   * вместо HTML5 drag-and-drop: тот не работает с пальца и на тачпаде
   * ведёт себя как попало. Цель ищем по координатам — под пальцем
   * элемент не меняется, пока захват удерживает событие.
   */
  function startColumnDrag(e: React.PointerEvent, columnId: string) {
    if (e.button !== 0) return;
    e.preventDefault();
    const handle = e.currentTarget as HTMLElement;
    // Захват держит события на ручке, даже когда палец ушёл с неё;
    // без активного указателя (автотест) браузер бросает исключение.
    try {
      handle.setPointerCapture(e.pointerId);
    } catch {
      /* без захвата события всё равно всплывают до ручки */
    }
    setDragCol(columnId);
    let target: string | null = null;
    const onMove = (ev: PointerEvent) => {
      const th = document
        .elementFromPoint(ev.clientX, ev.clientY)
        ?.closest<HTMLElement>('th[data-col]');
      target = th?.dataset.col ?? null;
      setOverCol(target);
    };
    const onUp = () => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.removeEventListener('pointercancel', onUp);
      setDragCol(null);
      setOverCol(null);
      if (!target || target === columnId) return;
      const order = columns.map((c) => c.id).filter((id) => id !== columnId);
      order.splice(order.indexOf(target), 0, columnId);
      report(m.reorderColumns.mutateAsync(order));
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onUp);
  }
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
  const [addingColumn, setAddingColumn] = useState(false);
  /** Отказ сервера на новую колонку — под полем окна, а не в общей полосе за ним. */
  const [columnError, setColumnError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /**
   * Отказ сервера — в полосу над таблицей. Через промис, а не onError
   * у mutate: тот срабатывает только у последнего вызова, а строки
   * удаляют и отмечают подряд, не дожидаясь ответа на предыдущую.
   */
  const report = (action: Promise<unknown>) => {
    action.catch((err: unknown) => setError(errorText(err)));
  };
  /** Ячейки, чья правка не дошла до сервера, — «строка:колонка»; они красные. */
  const [unsavedCells, setUnsavedCells] = useState<ReadonlySet<string>>(() => new Set());
  const markCell = (key: string, failed: boolean) =>
    setUnsavedCells((prev) => {
      if (prev.has(key) === failed) return prev;
      const next = new Set(prev);
      if (failed) next.add(key);
      else next.delete(key);
      return next;
    });
  const [preview, setPreview] = useState(false);

  /**
   * Файл, из которого разобран открытый диалог. Нужен, чтобы перечитать
   * его же, когда человек переключает понимание первой строки: вставку
   * из буфера второй раз не попросишь.
   */
  const parseSource = useRef<File | null>(null);

  /*
   * Выбор файла спрятан и живёт отдельно от кнопок: системное окно выбора
   * открывается уже после того, как закрылось меню или пустое состояние.
   */
  const xlsInput = useRef<HTMLInputElement>(null);

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
      if (parsed || preview) return;

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
  }, [parsed, preview, parseInto]);

  // Имена помним в пределах одного материала: у другого материала и таблица
  // другая, а одинаковая шапка там может значить другое.
  useEffect(() => setManualNames({}), [documentId]);

  /* Пока таблицы нет, шапка материала и лента шагов уже стоят на месте:
     иначе переход «Письмо → Получатели» на миг снимал шапку целиком,
     и она вставала обратно вместе с данными — рывок на весь экран.
     Панель значков ещё нечем наполнить, поэтому под ней пустая полоса
     той же высоты, чтобы таблица потом легла точно туда, где скелетон. */
  if (table.isPending || !table.data)
    return (
      <div className="flex h-[calc(100dvh-var(--app-header))] min-h-0 flex-col">
        <DocumentChrome
          documentId={documentId}
          title={doc.title}
          isTemplate={doc.isTemplate}
          actions={fileMenu.entries}
          view="recipients"
          toolbar={<span aria-hidden className="size-8" />}
        />
        {table.isPending ? (
          <SkeletonRows rows={8} label="Загружаем таблицу" />
        ) : (
          <ErrorState
            title="Таблица не открылась"
            onRetry={() => void table.refetch()}
            retrying={table.isFetching}
            code={table.error ? errorText(table.error) : undefined}
          />
        )}
        {fileMenu.dialogs}
      </div>
    );

  const { columns, rows, checkedCount } = table.data;
  const allChecked = rows.length > 0 && rows.every((r) => r.checked);
  const widths = Object.fromEntries(columns.map((col) => [col.name, fitChars(rows, col.name)]));

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
      setError(errorText(err));
    }
  }

  /*
   * Новая колонка из окна.
   *
   * Имя колонки становится переменной %имя, поэтому сервер пускает только
   * латиницу и объясняет отказ сам. Без onError его ответ пропадал: окно
   * молча стояло с «Командой» в поле. Набранное не стираем — его правят,
   * а не набирают заново.
   */
  function submitColumn() {
    const name = newColumn.trim();
    if (!name || m.addColumn.isPending) return;
    setColumnError(null);
    m.addColumn.mutate(name, {
      onSuccess: () => {
        setNewColumn('');
        setAddingColumn(false);
      },
      onError: (err) => setColumnError(errorText(err)),
    });
  }

  function closeAddColumn() {
    setAddingColumn(false);
    setColumnError(null);
  }

  /*
   * Меню «…» рамки: действия над списком целиком. Отменять в таблице
   * нечего — ячейка пишется на сервер по уходу из неё, — поэтому
   * «Правки» здесь нет: пункт, за которым нет действия, хуже отсутствующего.
   */
  const actions: MenuEntry[] = [
    ...fileMenu.entries,
    { separator: true },
    {
      icon: <Rows3 size={ICON.sm} strokeWidth={STROKE} />,
      label: 'Добавить строку',
      disabled: m.addRow.isPending,
      onSelect: () => report(m.addRow.mutateAsync()),
    },
    {
      icon: <Columns3 size={ICON.sm} strokeWidth={STROKE} />,
      label: 'Добавить колонку',
      onSelect: () => setAddingColumn(true),
    },
    { separator: true },
    {
      icon: <CheckCircle2 size={ICON.sm} strokeWidth={STROKE} />,
      label: 'Отметить все строки',
      disabled: rows.length === 0,
      onSelect: () => report(m.setChecked.mutateAsync({ checked: true })),
    },
    {
      icon: <ListX size={ICON.sm} strokeWidth={STROKE} />,
      label: 'Снять отметку со всех строк',
      disabled: rows.length === 0,
      onSelect: () => report(m.setChecked.mutateAsync({ checked: false })),
    },
    { separator: true },
    {
      icon: <Table2 size={ICON.sm} strokeWidth={STROKE} />,
      label: 'Выданное по материалу',
      onSelect: onGoToRegistry,
    },
  ];

  /*
   * Панель под лентой шагов: словами — то, что делают на этом шаге каждый
   * раз (загрузить список, проверить строки), значками — редкое. Залитая
   * кнопка на экране одна, и она в рамке — «Выпуск».
   */
  const openFile = () => xlsInput.current?.click();

  const toolbar = (
    <>
      <Button
        variant="secondary"
        size="sm"
        icon={<Upload size={ICON.sm} strokeWidth={STROKE} />}
        loading={m.parseFile.isPending}
        onClick={openFile}
        data-tour="import"
      >
        Загрузить файл
      </Button>
      {/* «Посмотреть» показывает одну грамоту, а бед в списке на триста
          человек глазами не увидеть: они прячутся в отдельных строках. */}
      <Button
        size="sm"
        icon={<ListChecks size={ICON.sm} strokeWidth={STROKE} />}
        disabled={checkedCount === 0}
        onClick={() => onOpen('check')}
        data-tour="check-rows"
      >
        Проверить строки
      </Button>

      <ToolDivider />

      <ToolButton
        title="Добавить строку"
        disabled={m.addRow.isPending}
        onClick={() => report(m.addRow.mutateAsync())}
      >
        <Plus size={ICON.sm} strokeWidth={STROKE} />
      </ToolButton>
      <ToolButton title="Добавить колонку" onClick={() => setAddingColumn(true)}>
        <Columns3 size={ICON.sm} strokeWidth={STROKE} />
      </ToolButton>

      <ToolDivider />

      {/* Посмотреть до выпуска: опечатка в макете, найденная после
          рассылки пятисот грамот, стоит несравнимо дороже. */}
      <ToolButton
        title="Посмотреть будущий документ"
        disabled={checkedCount === 0}
        onClick={() => setPreview(true)}
      >
        <Eye size={ICON.sm} strokeWidth={STROKE} />
      </ToolButton>

      <div className="ml-auto flex items-center gap-2">
        <span className="tabular text-sm text-muted max-md:hidden">
          отмечено {checkedCount} из {rows.length}
        </span>
        {/* «Данные», а не «Поля»: поля есть и у листа (отступы печати),
            а здесь — то, что подставится из таблицы получателей. */}
        <ToolButton title="Данные" active={fieldsOpen} onClick={toggleFieldsPanel}>
          <Variable size={ICON.sm} strokeWidth={STROKE} />
        </ToolButton>
      </div>
    </>
  );

  return (
    /* Точным счётом, а не `h-full`: оболочка кабинета не задаёт высоту
       своей колонке (иначе колонка разделов теряла прилипание на длинных
       страницах), и опереться на неё через `h-full` больше не на что. */
    <div className="flex h-[calc(100dvh-var(--app-header))] min-h-0 flex-col">
      <DocumentChrome
        documentId={documentId}
        title={doc.title}
        isTemplate={doc.isTemplate}
        actions={actions}
        view="recipients"
        toolbar={toolbar}
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

      {error && (
        <ErrorBar className="mx-3 mt-3">
          {error}{' '}
          <Button variant="link" onClick={() => setError(null)}>
            Скрыть
          </Button>
        </ErrorBar>
      )}

      <div className="flex min-h-0 flex-1">
        <div className="min-h-0 min-w-0 flex-1 overflow-auto">
          {rows.length === 0 ? (
            <NextAction
              icon={Users}
              title="Загрузите список получателей"
              text="Excel или CSV; шапку и пустые строки уберём сами"
              className="h-full justify-center"
              primary={
                <Button
                  variant="primary"
                  icon={<Upload size={ICON.sm} strokeWidth={STROKE} />}
                  loading={m.parseFile.isPending}
                  onClick={openFile}
                >
                  Загрузить файл
                </Button>
              }
              secondary={{
                label: 'Добавить строку',
                icon: <Plus size={ICON.sm} strokeWidth={STROKE} />,
                onClick: () => report(m.addRow.mutateAsync()),
              }}
            >
              <p className="mt-1 text-sm text-muted">
                Или скопируйте таблицу в Excel и вставьте сюда: <Kbd>Ctrl+V</Kbd>
              </p>
            </NextAction>
          ) : (
            /* Таблицу на телефоне видно и отметить строки можно; плашка честно
               говорит, что править ячейки удобнее за столом, и не заслоняет список. */
            <DesktopFirst
              compact
              title="Правку ячеек"
              why="Таблицу на телефоне видно, отметить строки можно, а вот править ячейки удобнее за столом."
            >
              <table className="w-full border-collapse text-sm">
                <thead className="sticky top-0 z-10 bg-sunken">
                  <tr>
                    <th
                      data-tour="check-all"
                      className="w-10 border-r border-b border-line px-3 py-2"
                    >
                      <Checkbox
                        checked={allChecked}
                        onChange={() => report(m.setChecked.mutateAsync({ checked: !allChecked }))}
                        aria-label="Отметить все"
                      />
                    </th>
                    {/* Номер строки — как в любой таблице: по нему называют место
                          ошибки («в двенадцатой опечатка»), и без него сверять
                          список с бумажным протоколом нечем. */}
                    <th className="w-12 border-r border-b border-line px-2 py-2 text-right text-xs font-normal text-muted">
                      №
                    </th>
                    {/* Итог сразу за номером: при широкой таблице колонки данных
                          уезжают вбок, а судьба строки должна оставаться на виду. */}
                    <th className="border-r border-b border-line px-3 py-2 text-left text-sm font-medium whitespace-nowrap">
                      Итог
                    </th>
                    {/* Заголовок — по-человечески, переменная под ним мелким.
                          Раньше колонки назывались «%name» и «%email»: для
                          человека это не название столбца, а шифр.
                          Переменную всё равно показываем — она нужна, когда
                          человек вписывает её в макет. */}
                    {columns.map((col) => (
                      <th
                        key={col.id}
                        data-col={col.id}
                        // Тянуть можно за весь заголовок, как в Airtable и Notion;
                        // ручка слева лишь подсказывает, что это возможно.
                        onPointerDown={(e) => {
                          if ((e.target as HTMLElement).closest('button')) return;
                          startColumnDrag(e, col.id);
                        }}
                        // В одну строку: в узкой колонке «E-mail» рвался по дефису,
                        // а «Фамилия, имя, отчество» раздувал шапку на три строки.
                        className={cn(
                          'group relative cursor-grab touch-none border-r border-b border-line px-3 py-2 text-left text-sm font-medium whitespace-nowrap select-none active:cursor-grabbing',
                          dragCol === col.id && 'opacity-40',
                        )}
                      >
                        {/* Линия вставки у левого края целевой колонки. */}
                        {dragCol && overCol === col.id && overCol !== dragCol && (
                          <span className="pointer-events-none absolute inset-y-1 -left-px w-0.5 rounded-full bg-accent" />
                        )}
                        <span className="inline-flex items-center gap-1.5">
                          {/* Ручка: колонки переставляются перетаскиванием, мышью
                                и пальцем — указательные события работают и там, и там. */}
                          <span
                            aria-hidden
                            className="-ml-1 text-muted opacity-0 transition-opacity group-hover:opacity-100"
                          >
                            <GripVertical size={ICON.sm} strokeWidth={STROKE} />
                          </span>
                          {columnTitle(col)}
                          <IconButton
                            size="sm"
                            label={`Удалить колонку ${columnTitle(col)}`}
                            onClick={() => report(m.deleteColumn.mutateAsync(col.id))}
                            className="size-6 opacity-0 group-hover:opacity-100 hover:text-danger pointer-coarse:size-10 pointer-coarse:opacity-100"
                          >
                            <X size={ICON.sm} strokeWidth={STROKE} />
                          </IconButton>
                        </span>
                        <span className="block font-mono text-xs font-normal text-muted">
                          %{col.name}
                        </span>
                      </th>
                    ))}
                    <th className="w-10 border-b border-line" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    <tr key={row.id} className="group hover:bg-row-hover">
                      <td className="border-r border-b border-line px-3 py-1 text-center">
                        <Checkbox
                          checked={row.checked}
                          onChange={() =>
                            report(
                              m.updateRow.mutateAsync({ rowId: row.id, checked: !row.checked }),
                            )
                          }
                          aria-label="Включить в выпуск"
                        />
                      </td>
                      <td className="tabular border-r border-b border-line px-2 py-1 text-right text-xs text-muted">
                        {index + 1}
                      </td>
                      <td className="border-r border-b border-line px-3 py-1">
                        <RowOutcomeChip row={row} />
                      </td>
                      {columns.map((col) => (
                        <td key={col.id} className="border-r border-b border-line p-0">
                          <input
                            defaultValue={row.data[col.name] ?? ''}
                            size={widths[col.name]}
                            // Нижний предел: когда шапки не влезают и таблица уезжает
                            // вбок, колонка иначе сжималась до ширины заголовка
                            // и почта превращалась в «a@exam…».
                            style={{
                              minWidth: `calc(${Math.min(widths[col.name], 12)}ch + 1.5rem)`,
                            }}
                            // Фамилии и названия организаций проверка орфографии
                            // подчёркивает сплошь — красное в каждой строке ничего не значит.
                            spellCheck={false}
                            onBlur={(e) => {
                              // Иначе ячейка так и остаётся прокрученной к концу
                              // и показывает «ФУ, г. Екатеринбург» без начала.
                              e.currentTarget.scrollLeft = 0;
                              const value = e.target.value;
                              const key = `${row.id}:${col.name}`;
                              // Вернули прежнее значение — сохранять нечего,
                              // и неудачная запись до этого больше не в счёт.
                              if (value === (row.data[col.name] ?? '')) {
                                markCell(key, false);
                                return;
                              }
                              // Набранное остаётся в ячейке: его правят,
                              // а не вспоминают и набирают заново.
                              m.updateRow
                                .mutateAsync({ rowId: row.id, data: { [col.name]: value } })
                                .then(
                                  () => markCell(key, false),
                                  (err: unknown) => {
                                    markCell(key, true);
                                    setError(`Строка ${index + 1}: ${errorText(err)}`);
                                  },
                                );
                            }}
                            aria-invalid={unsavedCells.has(`${row.id}:${col.name}`) || undefined}
                            // Рамка внутри ячейки: снаружи она легла бы на линии
                            // соседних клеток, а верх ушёл бы под прилипшую шапку.
                            className="w-full truncate bg-transparent px-3 py-1.5 outline-none focus:bg-surface focus:ring-2 focus:ring-focus focus:ring-inset aria-invalid:ring-2 aria-invalid:ring-danger aria-invalid:ring-inset"
                          />
                        </td>
                      ))}
                      <td className="border-b border-line px-2 text-center">
                        <IconButton
                          size="sm"
                          label="Удалить строку"
                          onClick={() => report(m.deleteRow.mutateAsync(row.id))}
                          className="size-7 opacity-0 group-hover:opacity-100 hover:text-danger pointer-coarse:size-10 pointer-coarse:opacity-100"
                        >
                          <Trash2 size={ICON.sm} strokeWidth={STROKE} />
                        </IconButton>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DesktopFirst>
          )}
        </div>
        {fieldsOpen && <FieldsSidebar documentId={documentId} />}
      </div>

      {/* На телефоне главное действие — внизу, под большим пальцем: в шапке
          рамки ему места нет и не достать. Число отмеченных — плашкой внутри,
          а не хвостом слова: счётчик должен читаться счётчиком. */}
      <div
        className="flex shrink-0 border-t border-line bg-surface px-4 pt-3 md:hidden"
        style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}
      >
        <Button variant="primary" size="lg" to={materialPath(doc.id, 'issue')} className="flex-1">
          Выпуск
          {checkedCount > 0 && (
            <span className="tabular grid h-6 min-w-6 place-items-center rounded-full bg-on-accent/20 px-2 text-sm font-semibold">
              {checkedCount}
            </span>
          )}
        </Button>
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
              {
                onSuccess: ({ imported }) => {
                  setParsed(null);
                  toast({ title: `Загружено строк: ${imported}`, tone: 'ok' });
                },
                onError: (e) => setError(errorText(e)),
              },
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

      {/* Новая колонка — окном, а не полем на панели: панель рассчитана
          на контролы одной высоты, и поле ввода в ней ломало строку каждый
          раз, когда название было длиннее слова. */}
      {addingColumn && (
        <Dialog
          title="Добавить колонку"
          size="sm"
          onClose={closeAddColumn}
          footer={
            <>
              <Button variant="ghost" onClick={closeAddColumn}>
                Отмена
              </Button>
              <Button
                variant="primary"
                disabled={!newColumn.trim()}
                loading={m.addColumn.isPending}
                onClick={submitColumn}
              >
                Добавить
              </Button>
            </>
          }
        >
          <Field
            label="Имя переменной"
            error={columnError}
            help={
              <>
                Так колонка будет называться в макете: напишете на листе %
                {newColumn.trim() || 'team'} — подставится её значение.
              </>
            }
          >
            <Input
              autoFocus
              value={newColumn}
              onChange={(e) => {
                setNewColumn(e.target.value);
                setColumnError(null);
              }}
              placeholder="team"
              className="font-mono"
              onKeyDown={(e) => e.key === 'Enter' && submitColumn()}
            />
          </Field>
        </Dialog>
      )}

      {fileMenu.dialogs}
    </div>
  );
}

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

/**
 * Желаемая ширина колонки в знаках — по самому длинному значению.
 *
 * Поле ввода без размера держит одну ширину на всех, около двадцати знаков:
 * фамилии обрезались на полуслове, а колонки с двузначными номерами стояли
 * такими же широкими. Размер лишь просит место — если всем не хватает,
 * таблица делит ширину пропорционально этим просьбам.
 */
function fitChars(rows: RecipientRow[], name: string): number {
  let longest = 0;
  for (const row of rows) longest = Math.max(longest, (row.data[name] ?? '').length);
  return Math.min(Math.max(longest + 1, 4), 36);
}
