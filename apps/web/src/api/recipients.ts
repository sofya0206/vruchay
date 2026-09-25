import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';

export interface RecipientColumn {
  id: string;
  name: string;
  position: number;
  /**
   * Заголовок колонки в загруженном файле: «Год рождения», «Команда».
   * null у колонок, заведённых руками, — там в шапке остаётся имя
   * переменной, потому что другого названия у них и не было.
   */
  title?: string | null;
}

export type MailStatus = 'queued' | 'sent' | 'delivered' | 'opened' | 'bounced' | 'failed';

export interface RecipientRow {
  id: string;
  position: number;
  data: Record<string, string>;
  checked: boolean;
  lastFileId: string | null;
  /** Последнее письмо о нынешнем файле строки. null — не отправляли. */
  mailStatus: MailStatus | null;
  /** Данные строки поправили после выпуска: на руках устаревший документ. */
  changedSinceIssue: boolean;
}

export interface RecipientTable {
  columns: RecipientColumn[];
  rows: RecipientRow[];
  checkedCount: number;
}

/**
 * Что разбор предлагает исправить в значениях. Готовые значения колонки
 * приходят вместе с предложением: правила написания фамилий живут
 * на сервере в одном месте, а применяет их человек галочкой в диалоге.
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

/** Как читать первую строку файла: решает разбор либо человек в диалоге. */
export type HeaderChoice = 'auto' | 'headers' | 'none';

export interface ParsedSheet {
  sheetName: string;
  headerRowIndex: number;
  /** `guessed` — имя подобрано по значениям колонки, а не по её заголовку. */
  columns: { source: string; suggested: string; guessed?: boolean }[];
  rows: string[][];
  skippedEmptyRows: number;
  /** Как разобрана первая строка: как названия колонок или как данные. */
  headerMode: 'headers' | 'none';
  /** Первая строка похожа на данные — диалог предлагает переключиться. */
  firstRowLooksLikeData: boolean;
  suggestions: ImportSuggestion[];
  warnings: string[];
  /**
   * Заполнено, когда файл прочитан как протокол мероприятия: нашлась графа
   * места или разбиение на группы. По groupColumn конструктор правил
   * предлагает колонку группы, не спрашивая её заново.
   */
  protocol?: {
    groupColumn: string;
    groups: { title: string; rowCount: number }[];
    headerRowCount: number;
  };
}

export interface GenerationJob {
  id: string;
  status: 'queued' | 'running' | 'done' | 'failed' | 'canceled';
  total: number;
  done: number;
  failed: number;
  error: string | null;
  /**
   * Задание стоит «в очереди», но за ним никто не пришёл.
   *
   * Считает сервер: в кабинете нет ни времени создания задания, ни правила,
   * по которому срок ожидания считается неразумным. Приходит только
   * с состоянием задания — у только что созданного его нет и быть не может.
   */
  stuck?: boolean;
}

export interface CanceledJob extends GenerationJob {
  /** Строки, до которых не дошли: за них не списано ни одного документа. */
  refunded: number;
}

/** Кого выпуск не осилил и почему. */
export interface JobFailure {
  rowId: string;
  name: string;
  reason: string;
}

/** Что можно сделать с готовым пакетом прямо сейчас. */
export interface DownloadOptions {
  count: number;
  pdfCount: number;
  sizeBytes: number;
  print: { allowed: boolean; reason: string | null; limitFiles: number; limitMb: number };
}

export function useRecipients(documentId: string) {
  return useQuery({
    queryKey: ['recipients', documentId],
    queryFn: () => api.get<RecipientTable>(`/documents/${documentId}/recipients`),
    // Пока письма стоят в очереди, итог строк меняется сам — без опроса
    // человек смотрел бы на «в очереди» до перезагрузки страницы.
    refetchInterval: (query) =>
      query.state.data?.rows.some((r) => r.mailStatus === 'queued') ? 5000 : false,
  });
}

export function useRecipientMutations(documentId: string) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ['recipients', documentId] });
  const base = `/documents/${documentId}/recipients`;

  return {
    updateRow: useMutation({
      mutationFn: (v: { rowId: string; data?: Record<string, string>; checked?: boolean }) =>
        api.patch(`${base}/rows/${v.rowId}`, { data: v.data, checked: v.checked }),
      onSuccess: refresh,
    }),
    addRow: useMutation({
      mutationFn: () => api.post(`${base}/rows`, { data: {} }),
      onSuccess: refresh,
    }),
    deleteRow: useMutation({
      mutationFn: (rowId: string) => api.delete(`${base}/rows/${rowId}`),
      onSuccess: refresh,
    }),
    addColumn: useMutation({
      // Строка — имя переменной латиницей (таблица получателей),
      // { title } — название по-русски: имя тогда подбирает сервер.
      mutationFn: (v: string | { title: string }) =>
        api.post<RecipientColumn>(`${base}/columns`, typeof v === 'string' ? { name: v } : v),
      onSuccess: refresh,
    }),
    reorderColumns: useMutation({
      mutationFn: (order: string[]) => api.post(`${base}/columns/order`, { order }),
      onSuccess: refresh,
    }),
    deleteColumn: useMutation({
      mutationFn: (columnId: string) => api.delete(`${base}/columns/${columnId}`),
      onSuccess: refresh,
    }),
    setChecked: useMutation({
      mutationFn: (v: { checked: boolean; rowIds?: string[] }) => api.post(`${base}/checked`, v),
      onSuccess: refresh,
    }),
    parseFile: useMutation({
      // headers — явный выбор человека в диалоге; по умолчанию решает разбор.
      mutationFn: (v: { file: File; headers?: HeaderChoice }) =>
        api.upload<ParsedSheet>(
          v.headers && v.headers !== 'auto'
            ? `${base}/parse?headers=${v.headers}`
            : `${base}/parse`,
          v.file,
        ),
    }),
    importRows: useMutation({
      mutationFn: (v: {
        columns: string[];
        rows: string[][];
        /** Заголовки колонок файла — шапка таблицы получателей рисуется ими. */
        titles?: string[];
        mode: 'append' | 'replace';
      }) =>
        api.post<{ imported: number }>(`${base}/import`, v),
      onSuccess: refresh,
    }),
  };
}

export function useGeneration(documentId: string, jobId: string | null) {
  const qc = useQueryClient();

  const job = useQuery({
    queryKey: ['job', jobId],
    queryFn: () => api.get<GenerationJob>(`/jobs/${jobId}`),
    enabled: Boolean(jobId),
    // Пока задание идёт — опрашиваем; как завершилось, останавливаемся.
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'queued' || status === 'running' ? 1500 : false;
    },
    // Генерация сотни сертификатов идёт минуты, и пользователь за это время
    // почти наверняка уйдёт в другую вкладку. Без этого флага опрос замирает
    // при потере фокуса, и вернувшийся человек видит навсегда застывший прогресс.
    refetchIntervalInBackground: true,
    // По той же причине данные задания не должны считаться свежими:
    // глобальный staleTime здесь только мешает.
    staleTime: 0,
  });

  // Выпуск закончился — у строк появились файлы, и итог в таблице
  // должен это показать, не дожидаясь перезагрузки.
  const finished =
    job.data && job.data.status !== 'queued' && job.data.status !== 'running'
      ? `${job.data.id}:${job.data.status}`
      : null;
  useEffect(() => {
    if (finished) void qc.invalidateQueries({ queryKey: ['recipients', documentId] });
  }, [finished, documentId, qc]);

  const start = useMutation({
    mutationFn: () => api.post<GenerationJob>(`/documents/${documentId}/generate`, { format: 'pdf' }),
    onSuccess: (created) => {
      qc.setQueryData(['job', created.id], created);
      void qc.invalidateQueries({ queryKey: ['recipients', documentId] });
    },
  });

  /**
   * Отмена начатого выпуска.
   *
   * Пакет на тысячу строк идёт больше часа, и увидеть на второй минуте
   * опечатку в макете — обычное дело. До сих пор оставалось только ждать,
   * пока сервис допечатает и оплатит тысячу заведомо негодных грамот.
   *
   * Уже созданные документы остаются: человек отменяет остаток, а не
   * отказывается от сделанного.
   */
  const cancel = useMutation({
    mutationFn: (id: string) => api.post<CanceledJob>(`/jobs/${id}/cancel`, {}),
    onSuccess: (canceled) => {
      qc.setQueryData(['job', canceled.id], canceled);
      // Остаток пробы вернулся к тому, что успели напечатать, — цифра
      // на главной должна показать это сразу.
      void qc.invalidateQueries({ queryKey: ['usage'] });
    },
  });

  /**
   * Продолжить прерванный выпуск.
   *
   * Отдельно от «Создать документы» намеренно: то — новый выпуск и новая
   * оплата, а это доделывает то же задание. Падение на девятитысячной
   * строке из десяти тысяч без такой кнопки означало бы выпуск заново
   * и повторную оплату девяти тысяч документов.
   */
  const resume = useMutation({
    mutationFn: (id: string) => api.post<GenerationJob>(`/jobs/${id}/resume`, {}),
    onSuccess: (revived) => {
      qc.setQueryData(['job', revived.id], revived);
      void qc.invalidateQueries({ queryKey: ['usage'] });
    },
  });

  return { job: job.data, start, cancel, resume };
}

/** Поимённый отчёт о неудачах выпуска. Спрашиваем только когда есть о чём. */
export function useJobFailures(jobId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['job-failures', jobId],
    queryFn: () => api.get<JobFailure[]>(`/jobs/${jobId}/failures`),
    enabled: Boolean(jobId) && enabled,
  });
}

/**
 * Что можно сделать с готовым пакетом.
 *
 * Спрашиваем до нажатия: общий PDF собирается в памяти, и большому пакету
 * в ней не поместиться. Узнать об этом отказом в новой вкладке — значит
 * получить голый JSON вместо файла.
 */
export function useDownloadOptions(jobId: string | null) {
  return useQuery({
    queryKey: ['download-options', jobId],
    queryFn: () => api.get<DownloadOptions>(`/jobs/${jobId}/download-options`),
    enabled: Boolean(jobId),
  });
}

/** Кого рассылка пропустила и почему — показываем поимённо, а не числом. */
export interface SendResult {
  queued: number;
  skipped: { name: string; reason: string }[];
}

/**
 * Рассылка созданных документов участникам.
 *
 * Отдельное действие, а не продолжение выпуска: файлы часто делают заранее,
 * а рассылают в день награждения. Маршрут на сервере был с самого начала,
 * но вызвать его из кабинета было нечем — письма не уходили никому.
 */
export function useSend(documentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<SendResult>(`/mail/send/${documentId}`, {}),
    onSuccess: () => {
      // Реестр и итог строк показывают состояние писем — после рассылки
      // они устарели.
      void qc.invalidateQueries({ queryKey: ['registry', documentId] });
      void qc.invalidateQueries({ queryKey: ['recipients', documentId] });
    },
  });
}

/**
 * Настроено ли письмо. Нужно до выпуска, а не после: узнать, что рассылать
 * нечем, когда файлы уже созданы, — значит проделать половину работы впустую.
 */
export function useMailTemplate(documentId: string) {
  return useQuery({
    queryKey: ['email-template', documentId],
    queryFn: () =>
      api.get<{ subject: string; bodyHtml: string; attachGeneratedFile: boolean } | null>(
        `/mail/templates/${documentId}`,
      ),
  });
}
