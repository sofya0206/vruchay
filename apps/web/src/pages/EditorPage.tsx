import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ErrorState } from '../ui/ErrorState';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
  CopyPlus,
  Dot,
  Grid3x3,
  ImageUp,
  Layers,
  LoaderCircle,
  Magnet,
  Paintbrush,
  Printer,
  Proportions,
  Redo2,
  SlidersHorizontal,
  SquareDashed,
  Table2,
  Trash2,
  TriangleAlert,
  Undo2,
  Variable,
  Wand2,
} from 'lucide-react';
import type { Editor } from '@tiptap/core';
import {
  issuedAtOf,
  sheetLayout,
  type RichDoc,
  type SheetElement,
  type SheetLayout,
  type ShapeElement,
  type TextElement,
  type TextProps,
} from '@gramota/shared';

type QrElement = Extract<SheetElement, { type: 'qr' }>;
type LinkElement = Extract<SheetElement, { type: 'link' }>;
import { InsertMenu, type InsertKind } from '../editor/InsertMenu';
import { CanvasMenu } from '../editor/CanvasMenu';
import { DocumentChrome, ToolButton, ToolDivider } from '../editor/DocumentChrome';
import { useDocumentFileMenu } from '../editor/DocumentFileMenu';
import { SheetTabs } from '../editor/SheetTabs';
import type { MenuEntry } from '../editor/DocumentChrome';
import { StatusChip } from '../ui/Field';
import { IconButton } from '../ui/IconButton';
import { Select } from '../ui/Select';
import { api } from '../api/client';
import { useOrgProfile } from '../api/org';
import { useRecipientMutations } from '../api/recipients';
import { useDocumentFields } from '../editor/useDocumentFields';
import type { DocumentDetail } from '../api/types';
import type { EventValues } from '../editor/EventFields';
import { canvasPreviewData } from '../editor/preview-data';
import { movedViewTarget } from '../editor/moved-views';
import { workspacePath } from '../mailing/workspace-tabs';
import { SheetRenderer } from '../render/SheetRenderer';
import { PropertiesPanel } from '../editor/PropertiesPanel';
import { LayersPanel } from '../editor/LayersPanel';
import { FIELD_DRAG_TYPE, FieldsList } from '../editor/FieldsList';
import { setFieldsPanelOpen, useFieldsPanelOpen } from '../editor/fields-sidebar-store';
import { InlineTextEditor } from '../editor/rich/InlineTextEditor';
import { useLayoutHistory } from '../editor/useLayoutHistory';
import { FitPageDialog } from '../editor/FitPageDialog';
import { PageSizeDialog } from '../editor/PageSizeDialog';
import { Tooltip } from '../ui/Tooltip';
import { Button } from '../ui/Button';
import { ResizeDialog } from '../editor/ResizeDialog';
import { fitPageToImage, readImageSize, type PageFit } from '../editor/fit-page';
import { insertedImageBox } from '../editor/image-box';
import { backgroundDpi, BLEED_MM, POOR_DPI, PRINT_DPI, resizeLayout, SAFE_MARGIN_MM, type ResizeMode } from '../editor/page-fit';
import {
  applyMatches,
  fieldFromColumn,
  fieldLabels,
  knownFieldKeys,
  proposeMatches,
  type FieldInfo,
} from '../editor/fields';
import { appendField, docWithField } from '../editor/doc-ops';
import {
  clamp,
  fitZoom,
  moveBox,
  PX_PER_MM,
  pxToMm,
  resizeBox,
  roundBox,
  squareBox,
  type Box,
  type ResizeHandle,
} from '../editor/geometry';
import {
  alignBoxes,
  boundingBox,
  distributeBoxes,
  DUPLICATE_OFFSET_MM,
  expandToGroups,
  marqueeSelect,
  moveGroup,
  moveLayer,
  nudgeBox,
  pickTextStyle,
  rectFromPoints,
  rotationFromPointer,
  scaleGroup,
  selectableIds,
  snapBox,
  snapCandidates,
  snapToGrid,
  type AlignKind,
  type Rect,
  type SnapLine,
  type TextStylePatch,
} from '../editor/selection';

const AUTOSAVE_DELAY_MS = 1500;
const HANDLES: ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const CORNERS: ResizeHandle[] = ['nw', 'ne', 'se', 'sw'];
/** Шаг сетки в мм — и шаг прилипания к ней, когда сетка включена. */
const GRID_MM = 5;
/** С какого расстояния на экране блок прилипает к направляющей. */
const SNAP_PX = 6;
/**
 * Короче этого блок на экране считается тесным: ручки уходят за рамку,
 * иначе они закрывали бы его и вместо сдвига получалось растягивание.
 */
const TIGHT_PX = 40;

/** Размер листа в мм — или ничего, пока документ не загружен. */
function pageBoxOf(doc: { pageWidthMm: number; pageHeightMm: number } | undefined) {
  return doc ? { w: doc.pageWidthMm, h: doc.pageHeightMm } : null;
}
/** Сдвиг стрелками: пункт и десять пунктов, как просит бриф, — в миллиметрах. */
const NUDGE_MM = 25.4 / 72;

interface GestureBase {
  startX: number;
  startY: number;
  /** Было ли реальное перемещение: от этого зависит и история, и сохранение. */
  moved: boolean;
}
type Gesture =
  /** `lines` — направляющие: считаются один раз на жест, остальные блоки стоят на месте. */
  | (GestureBase & { kind: 'move'; boxes: Record<string, Box>; lines?: SnapLine[] })
  /** `keepRatio` — угол тянет с сохранением пропорций: у картинки всегда, у прочих с Shift. */
  | (GestureBase & { kind: 'resize'; id: string; handle: ResizeHandle; box: Box; keepRatio: boolean; square: boolean })
  | (GestureBase & { kind: 'scale'; handle: ResizeHandle; frame: Rect; boxes: Record<string, Box>; sizes: Record<string, number> })
  | (GestureBase & { kind: 'rotate'; id: string; center: { x: number; y: number } })
  | (GestureBase & { kind: 'marquee'; additive: boolean; base: ReadonlySet<string> });

/** Открытая панель справа. `null` — панели нет, лист занимает весь экран. */
type Panel = 'props' | 'layers' | 'fields';

/**
 * Страница редактирования материала.
 *
 * Здесь только лист: холст, блоки, их свойства, поля подстановки
 * и сохранение. Работа со списком и с письмом отсюда уехала целиком —
 * она живёт в рабочем месте материала на «Рассылке».
 *
 * Причина в том, как устроен день: макет рисуют один раз и заранее,
 * а рассылают в день награждения и часто не тот же человек. Пока обе
 * работы жили под одной шапкой, редактор открывался ради списка,
 * и первое, что видел пришедший разослать, — чужой лист, который можно
 * случайно сдвинуть. Обратно, к рассылке, отсюда ведёт одна кнопка,
 * а не встроенная панель.
 *
 * Текст правится прямо на листе: двойной клик по блоку открывает
 * его в живом редакторе на том же месте, без отдельного окна.
 */
export function EditorPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  /** Настройки какого поля открыть при входе в правку — по правой кнопке. */
  const [openField, setOpenField] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const [saved, setSaved] = useState<'saved' | 'saving' | 'dirty' | 'error'>('saved');
  const [viewMode, setViewMode] = useState<'placeholders' | 'data'>('placeholders');
  const [rowIndex, setRowIndex] = useState(0);
  const [showGrid, setShowGrid] = useState(false);
  const [snapping, setSnapping] = useState(true);
  const [guides, setGuides] = useState<SnapLine[]>([]);
  const [marquee, setMarquee] = useState<Rect | null>(null);
  /*
   * Панель справа открыта с самого начала, как в Figma и Pitch: свойства,
   * данные и слои — её вкладки, и других кнопок для них нет. Свернуть её
   * можно крестиком; свёрнутая оставляет полоску значков у края, и любой
   * из них раскрывает панель сразу на нужной вкладке.
   */
  const [otherPanel, setOtherPanel] = useState<Exclude<Panel, 'fields'> | null>('props');
  /*
   * Поля — общая панель всего материала, а не только листа: открытая здесь,
   * она остаётся открытой в письме и в таблице, поэтому живёт не в этом
   * компоненте, а в `fields-sidebar-store`. Свойства и слои — свои.
   */
  const fieldsOpen = useFieldsPanelOpen();
  const panel: Panel | null = fieldsOpen ? 'fields' : otherPanel;
  const setPanel = (next: Panel | null) => {
    setFieldsPanelOpen(next === 'fields');
    if (next !== 'fields') setOtherPanel(next);
  };
  const [showSafeArea, setShowSafeArea] = useState(false);
  /** Смена размера листа, ожидающая ответа «что делать с блоками». */
  const [resizeTo, setResizeTo] = useState<{ widthMm: number; heightMm: number } | null>(null);
  /** Предупреждение о разрешении загруженного бланка. */
  const [backgroundNote, setBackgroundNote] = useState<string | null>(null);
  /** Зажат пробел — перетаскивание холста вместо блоков. */
  const [panning, setPanning] = useState(false);
  const pan = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const [styleClipboard, setStyleClipboard] = useState<TextStylePatch | null>(null);
  /*
   * Номер последней правки, сделанной человеком.
   *
   * Нужен, чтобы ответ на устаревший запрос не показал «Сохранено».
   * Автосохранение откладывается на полторы секунды, и за время полёта
   * запроса человек успевает подвинуть блок ещё раз: ответ на первую
   * правку приходит, когда вторая ещё ждёт своей очереди. Чип «Сохранено»
   * в этот момент — неправда, а поверив ему и перезагрузив страницу,
   * человек теряет вторую правку молча.
   */
  const latestVersion = useRef(0);
  /*
   * Что набрано в «О мероприятии» прямо сейчас, до сохранения.
   *
   * Нужно ради живого холста: поле сохраняется по уходу с него, и без
   * черновика название появлялось бы на листе только после клика мимо.
   */
  const [eventDraft, setEventDraft] = useState<EventValues | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const backgroundInput = useRef<HTMLInputElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  /** Тащат ли над холстом файл: лист подсвечивается, куда он ляжет. */
  const [fileOver, setFileOver] = useState(false);
  const clipboard = useRef<SheetElement[]>([]);
  /** Меню по правому клику на пустом месте: где показать и куда вставлять. */
  const [canvasMenu, setCanvasMenu] = useState<{ x: number; y: number; mm: { x: number; y: number } } | null>(null);
  const liveEditor = useRef<Editor | null>(null);

  // Адреса уехавших вкладок: `?view=table` и соседние. Разбираются
  // отдельно, в `moved-views.ts`, — там же объяснено зачем.
  const [params] = useSearchParams();
  const moved = movedViewTarget(params.get('view'), id);

  const doc = useQuery({
    queryKey: ['document', id],
    queryFn: () => api.get<DocumentDetail>(`/documents/${id}`),
  });

  /*
   * Какой лист правим. Держим по идентификатору, а не по номеру: после
   * удаления соседнего листа номер съезжает, и правка ушла бы не в тот лист.
   * Пока выбора не было — первый; исчезнувший лист тоже откатывает к первому.
   */
  const [activeSheetId, setActiveSheetId] = useState<string | null>(null);
  const sheets = useMemo(() => doc.data?.sheets ?? [], [doc.data]);
  const sheet = sheets.find((s) => s.id === activeSheetId) ?? sheets[0];
  useEffect(() => {
    setEventDraft(null);
    setActiveSheetId(null);
  }, [id]);
  const history = useLayoutHistory([]);
  const { reset, beginGesture, endGesture, setLayout } = history;

  /*
   * Макет с сервера кладём в историю только при смене листа — и через
   * разбор схемы: в базе ещё долго будут макеты первой версии, с текстом
   * строкой, а холсту нужно дерево.
   */
  const sheetId = sheet?.id;
  const loaded = useRef<string | null>(null);
  useEffect(() => {
    if (!sheet || loaded.current === sheet.id) return;
    loaded.current = sheet.id;
    reset(sheetLayout.parse(sheet.layout));
  }, [sheet, sheetId, reset]);

  /*
   * Колонки списка и его строки.
   *
   * Это не работа со списком, а то, без чего нельзя рисовать лист:
   * имена колонок становятся полями подстановки, а строки — образцом
   * на холсте, чтобы на месте поля стояла живая фамилия.
   */
  const { recipients, columns, fields } = useDocumentFields(id);
  const recipientMutations = useRecipientMutations(id);
  const org = useOrgProfile();

  const known = useMemo(() => knownFieldKeys(columns), [columns]);
  const labels = useMemo(() => fieldLabels(fields), [fields]);

  const background = useQuery({
    queryKey: ['file-url', sheet?.backgroundFileId],
    queryFn: () => api.get<{ url: string }>(`/documents/files/${sheet!.backgroundFileId}/url`),
    enabled: Boolean(sheet?.backgroundFileId),
  });

  /*
   * Удавшийся запрос снимает прежнюю ошибку — но только её.
   *
   * Загрузка бланка и настройки мероприятия ходят на сервер своими
   * запросами, и их успех значит, что связь есть. Держать после этого
   * «Не удалось сохранить» незачем. А вот «Есть правки» и «Сохраняем»
   * трогать нельзя: они говорят про макет, которого эти запросы
   * не касались.
   */
  const clearSaveError = useCallback(
    () => setSaved((state) => (state === 'error' ? 'saved' : state)),
    [],
  );

  /**
   * Отметку об успехе снимаем только с той правки, которая и уехала.
   *
   * Номер правки едет вместе с макетом и возвращается в `onSuccess`
   * вторым аргументом. Если он отстал от `latestVersion`, значит человек
   * успел поправить ещё раз: «Сохранено» показывать нельзя — пусть чип
   * остаётся тем, что поставила новая правка («Есть правки» или
   * «Сохраняем»), и сменится, когда доедет она.
   */
  const save = useMutation({
    /* Лист записываем тот, с которого правка снята: пока идентификатор брался
       из открытого сейчас, отложенное сохранение после перехода на соседний
       лист записывало бы в него чужой макет. */
    mutationFn: ({ sheetId, layout }: { sheetId: string; layout: unknown; version: number }) =>
      api.patch(`/documents/${id}/sheets/${sheetId}`, { layout }),
    onSuccess: (_data, sent) => {
      if (sent.version === latestVersion.current) setSaved('saved');
    },
    // Без этого упавший запрос оставлял чип на «Сохраняем» навсегда:
    // человек видел бесконечное сохранение и ни одного слова о том,
    // что правка не уехала.
    onError: () => setSaved('error'),
  });

  const uploadBackground = useMutation({
    mutationFn: (file: File) =>
      api.upload<{ fileId: string; url: string }>(`/documents/${id}/sheets/${sheet!.id}/background`, file),
    onSuccess: () => {
      clearSaveError();
      void doc.refetch();
      void background.refetch();
    },
    onError: () => setSaved('error'),
  });

  const uploadImage = useMutation({
    mutationFn: (file: File) => api.upload<{ fileId: string; url: string }>(`/documents/${id}/assets`, file),
    onSuccess: clearSaveError,
  });

  /** Что предложить, если бланк не тех пропорций, что лист. */
  const [fit, setFit] = useState<PageFit | null>(null);

  /** Открыт ли выбор формата листа из панели инструментов. */
  const [sizeOpen, setSizeOpen] = useState(false);

  const resizePage = useMutation({
    mutationFn: (size: { widthMm: number; heightMm: number }) =>
      api.patch(`/documents/${id}`, {
        pageWidthMm: size.widthMm,
        pageHeightMm: size.heightMm,
      }),
    onSuccess: () => {
      clearSaveError();
      void doc.refetch();
    },
    onError: () => setSaved('error'),
  });

  /** Собственные настройки материала: мероприятие и проверка по QR. */
  const saveEvent = useMutation({
    mutationFn: (values: Record<string, unknown>) => api.patch(`/documents/${id}`, values),
    onSuccess: () => {
      clearSaveError();
      void doc.refetch();
    },
    onError: () => setSaved('error'),
  });

  /* Новый лист сразу открывается: его затем и добавляют, чтобы рисовать. */
  const addSheet = useMutation({
    mutationFn: () => api.post<{ id: string }>(`/documents/${id}/sheets`, {}),
    onSuccess: async (created) => {
      clearSaveError();
      await doc.refetch();
      setSelected(new Set());
      setActiveSheetId(created.id);
    },
    onError: () => setSaved('error'),
  });

  const deleteSheet = useMutation({
    mutationFn: (sheetId: string) => api.delete<{ ok: true }>(`/documents/${id}/sheets/${sheetId}`),
    onSuccess: () => {
      clearSaveError();
      setSelected(new Set());
      setActiveSheetId(null);
      void doc.refetch();
    },
    onError: () => setSaved('error'),
  });

  /* Действия над материалом целиком — те же, что и над таблицей. */
  const fileMenu = useDocumentFileMenu(doc.data);

  async function onPickBackground(file: File) {
    const size = await readImageSize(file).catch(() => null);
    await uploadBackground.mutateAsync(file);
    if (!size || !doc.data) return;
    const result = fitPageToImage({ widthMm: doc.data.pageWidthMm, heightMm: doc.data.pageHeightMm }, size);
    if (result.mismatched) setFit(result);
    // Для печати нужно 300 точек на дюйм; скан с телефона даёт вдвое меньше,
    // и на бумаге это видно. Говорим сразу, пока файл можно заменить.
    const dpi = backgroundDpi(size, { w: doc.data.pageWidthMm, h: doc.data.pageHeightMm });
    setBackgroundNote(
      dpi < POOR_DPI
        ? `Бланк ${dpi} dpi — для печати мало, будет мыло. Нужно ${PRINT_DPI}.`
        : dpi < PRINT_DPI
          ? `Бланк ${dpi} dpi — для экрана хватит, для типографии нужно ${PRINT_DPI}.`
          : null,
    );
  }

  /**
   * Масштаб на экране — не документ: лист остаётся в миллиметрах,
   * меняется только то, как он показан. «По ширине», «по высоте»,
   * 100 % и колёсико с Ctrl — как в любом графическом редакторе.
   */
  function zoomTo(kind: 'width' | 'height' | 'fit' | 'actual') {
    const el = containerRef.current;
    if (!el || !doc.data) return;
    const available = { w: el.clientWidth - 72, h: el.clientHeight - 72 };
    const next =
      kind === 'actual'
        ? 1
        : kind === 'width'
          ? available.w / (doc.data.pageWidthMm * PX_PER_MM)
          : kind === 'height'
            ? available.h / (doc.data.pageHeightMm * PX_PER_MM)
            : fitZoom(el.clientWidth - 24, el.clientHeight - 24, doc.data.pageWidthMm, doc.data.pageHeightMm);
    setZoom(clamp(next, 0.25, 4));
  }

  // Автосохранение: откладываем запись, пока пользователь продолжает править.
  const { layout, version } = history;
  useEffect(() => {
    if (!sheet || version === 0) return;
    latestVersion.current = version;
    setSaved('dirty');
    const timer = setTimeout(() => {
      setSaved('saving');
      save.mutate({ sheetId: sheet.id, layout, version });
    }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
    // Намеренно следим только за version и sheet: объект мутации пересоздаётся
    // на каждый рендер и в зависимостях сбрасывал бы таймер бесконечно.
  }, [version, sheet]);

  // Масштаб «вписать в окно» пересчитывается при изменении размеров контейнера.
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el || !doc.data) return;
    const recompute = () =>
      setZoom(fitZoom(el.clientWidth - 24, el.clientHeight - 24, doc.data.pageWidthMm, doc.data.pageHeightMm));
    recompute();
    const observer = new ResizeObserver(recompute);
    observer.observe(el);
    return () => observer.disconnect();
  }, [doc.data]);

  const hasCanvas = Boolean(doc.data);
  // Ctrl+колёсико — масштаб, а не прокрутка страницы; пробел — панорамирование.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setZoom((z) => clamp(z * Math.exp(-e.deltaY * 0.0015), 0.25, 4));
    };
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (e.code !== 'Space' || target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName ?? '')) return;
      e.preventDefault();
      setPanning(true);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') setPanning(false);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      el.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
    // Холст появляется только после загрузки материала: с пустыми
    // зависимостями колесо вешалось на null и зум не работал вовсе.
  }, [hasCanvas]);

  // Выделение не переживает исчезновение блока: удалили — сняли.
  useEffect(() => {
    const ids = new Set(layout.map((el) => el.id));
    if ([...selected].some((s) => !ids.has(s))) {
      setSelected(new Set([...selected].filter((s) => ids.has(s))));
    }
    if (editingId && !ids.has(editingId)) setEditingId(null);
  }, [layout, selected, editingId]);

  /*
   * Панель свойств открывается сама на первом выделенном блоке — и только
   * на первом. Закрыл её и щёлкнул по соседнему блоку — она остаётся
   * закрытой: раз человек её убрал, значит сейчас смотрит на лист.
   */
  const hadSelection = useRef(false);
  useEffect(() => {
    const has = selected.size > 0;
    // Открытые поля не подменяем свойствами: из них как раз вставляют
    // в только что выделенный блок.
    if (has && !hadSelection.current && !fieldsOpen) setOtherPanel((current) => current ?? 'props');
    hadSelection.current = has;
  }, [selected, fieldsOpen]);

  const selectedElements = useMemo(
    () => layout.filter((el) => selected.has(el.id)),
    [layout, selected],
  );

  const rows = recipients.data?.rows ?? [];
  const rowCount = rows.length;
  const safeRow = rowCount ? Math.min(rowIndex, rowCount - 1) : 0;

  /*
   * Значения для холста: на листе должно стоять название мероприятия,
   * а не «%event». Что именно подставляется и почему — в `preview-data.ts`.
   * Черновик мероприятия сильнее сохранённого: он и есть то, что человек
   * набирает прямо сейчас, глядя на лист.
   */
  const previewData = useMemo(
    () =>
      canvasPreviewData({
        row: rows[safeRow]?.data,
        orgName: org.data?.orgName,
        event: {
          name: eventDraft?.eventName ?? doc.data?.eventName,
          date: eventDraft?.eventDate ?? doc.data?.eventDate,
          place: eventDraft?.eventPlace ?? doc.data?.eventPlace,
          hours: eventDraft?.eventHours ?? doc.data?.eventHours,
        },
        issuedAt: issuedAtOf(eventDraft?.issueDate || doc.data?.issueDate),
        number: safeRow + 1,
        total: rowCount,
      }),
    [rows, safeRow, rowCount, org.data, doc.data, eventDraft],
  );

  const matches = useMemo(() => proposeMatches(layout, columns), [layout, columns]);

  /* ────────────────────────────── правки макета ────────────────────────── */

  const patchElements = useCallback(
    (ids: ReadonlySet<string>, fn: (el: SheetElement) => SheetElement, commit = true) => {
      history.setLayout((prev) => prev.map((el) => (ids.has(el.id) ? fn(el) : el)), commit);
    },
    [history],
  );

  const updateBoxes = useCallback(
    (boxes: Record<string, Box>, commit: boolean) => {
      history.setLayout(
        (prev) => prev.map((el) => (boxes[el.id] ? { ...el, ...roundBox(boxes[el.id]) } : el)),
        commit,
      );
    },
    [history],
  );

  const patchTextProps = useCallback(
    (patch: Partial<TextProps>, commit = true) =>
      patchElements(
        selected,
        (el) => (el.type === 'text' ? { ...el, props: { ...el.props, ...patch } } : el),
        commit,
      ),
    [patchElements, selected],
  );

  const patchShapeProps = useCallback(
    (patch: Partial<ShapeElement['props']>, commit = true) =>
      patchElements(
        selected,
        (el) => (el.type === 'shape' ? { ...el, props: { ...el.props, ...patch } } : el),
        commit,
      ),
    [patchElements, selected],
  );

  const patchQrProps = useCallback(
    (patch: Partial<QrElement['props']>, commit = true) =>
      patchElements(
        selected,
        (el) => (el.type === 'qr' ? { ...el, props: { ...el.props, ...patch } } : el),
        commit,
      ),
    [patchElements, selected],
  );

  const patchLinkProps = useCallback(
    (patch: Partial<LinkElement['props']>, commit = true) =>
      patchElements(
        selected,
        (el) => (el.type === 'link' ? { ...el, props: { ...el.props, ...patch } } : el),
        commit,
      ),
    [patchElements, selected],
  );

  const setDoc = useCallback(
    (elementId: string, richDoc: RichDoc, commit: boolean) =>
      patchElements(
        new Set([elementId]),
        (el) => (el.type === 'text' ? { ...el, props: { ...el.props, doc: richDoc } } : el),
        commit,
      ),
    [patchElements],
  );

  /** Выделить: обычный клик — только этот, Shift — добавить/убрать. Группа тянется целиком. */
  const select = useCallback(
    (elementId: string | null, additive: boolean) => {
      setSelected((prev) => {
        if (!elementId) return additive ? prev : new Set();
        const next = new Set(additive ? prev : []);
        if (additive && prev.has(elementId)) next.delete(elementId);
        else next.add(elementId);
        return expandToGroups(layout, next);
      });
    },
    [layout],
  );

  const removeSelected = useCallback(() => {
    if (selected.size === 0) return;
    history.setLayout((prev) => prev.filter((el) => !selected.has(el.id)));
    setSelected(new Set());
  }, [history, selected]);

  /** Копия выбранных — новыми блоками, чуть сдвинутыми, чтобы не легли поверх. */
  const cloneInto = useCallback(
    (source: SheetElement[]) => {
      if (!source.length || !doc.data) return;
      const page = { w: doc.data.pageWidthMm, h: doc.data.pageHeightMm };
      const groupMap = new Map<string, string>();
      const maxZ = Math.max(-1, ...layout.map((el) => el.z));
      const clones = source.map((el, i) => {
        const groupId = el.groupId ? (groupMap.get(el.groupId) ?? groupMap.set(el.groupId, crypto.randomUUID()).get(el.groupId)!) : null;
        const box = nudgeBox(el, DUPLICATE_OFFSET_MM, DUPLICATE_OFFSET_MM, page);
        return { ...el, ...box, id: crypto.randomUUID(), z: maxZ + 1 + i, groupId } as SheetElement;
      });
      history.setLayout((prev) => [...prev, ...clones]);
      setSelected(new Set(clones.map((c) => c.id)));
    },
    [doc.data, history, layout],
  );

  const canInsertIntoText =
    editingId !== null || (selectedElements.length === 1 && selectedElements[0].type === 'text');

  const insertField = useCallback(
    (field: FieldInfo) => {
      if (liveEditor.current) {
        liveEditor.current
          .chain()
          .focus()
          .insertContent([{ type: 'mergeField', attrs: { source: field.source, fieldId: field.fieldId } }, { type: 'text', text: ' ' }])
          .run();
        return;
      }
      const one = selectedElements.length === 1 ? selectedElements[0] : null;
      if (one && one.type === 'text') {
        setDoc(one.id, appendField(one.props.doc, field.source, field.fieldId), true);
        return;
      }
      addElement({ type: 'text', field });
    },
    [selectedElements, setDoc],
  );

  /* ─────────────────────────────── жесты холста ────────────────────────── */

  const pointToMm = useCallback(
    (clientX: number, clientY: number) => {
      const rect = sheetRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return { x: pxToMm(clientX - rect.left, zoom), y: pxToMm(clientY - rect.top, zoom) };
    },
    [zoom],
  );

  /*
   * Всё, что жест читает на каждом кадре, — через ref, а не через
   * зависимости эффекта. Иначе каждое движение мыши (оно меняет макет)
   * снимало и заново вешало обработчики на окно — на каждом кадре.
   */
  const live = useRef({ layout, zoom, showGrid, snapping, page: pageBoxOf(doc.data), updateBoxes, patchElements, pointToMm });
  useLayoutEffect(() => {
    live.current = { layout, zoom, showGrid, snapping, page: pageBoxOf(doc.data), updateBoxes, patchElements, pointToMm };
  });

  useEffect(() => {
    /*
     * Мышь присылает движения чаще, чем экран обновляется, — на 120 Гц
     * вдвое чаще. Пересчитывать макет на каждое значит перерисовывать
     * редактор по нескольку раз за кадр; берём последнее за кадр.
     */
    let frameId = 0;
    let pending: PointerEvent | null = null;
    let shownGuides: SnapLine[] = [];

    const showGuides = (next: SnapLine[]) => {
      const same =
        next.length === shownGuides.length &&
        next.every((line, i) => line.axis === shownGuides[i].axis && line.at === shownGuides[i].at);
      if (same) return;
      shownGuides = next;
      setGuides(next);
    };

    function apply(e: PointerEvent) {
      const g = gesture.current;
      const { layout, zoom, showGrid, snapping, page, updateBoxes, patchElements, pointToMm } = live.current;
      if (!g || !page) return;

      if (g.kind === 'marquee') {
        const from = pointToMm(g.startX, g.startY);
        const to = pointToMm(e.clientX, e.clientY);
        const rect = rectFromPoints(from.x, from.y, to.x, to.y);
        setMarquee(rect);
        const hit = marqueeSelect(layout, rect);
        setSelected(expandToGroups(layout, g.additive ? new Set([...g.base, ...hit]) : hit));
        return;
      }

      const dx = pxToMm(e.clientX - g.startX, zoom);
      const dy = pxToMm(e.clientY - g.startY, zoom);

      // Снимок в историю делаем один раз, на первом сдвиге.
      if (!g.moved) {
        g.moved = true;
        beginGesture();
      }

      if (g.kind === 'move') {
        const ids = Object.keys(g.boxes);
        const boxes = ids.map((k) => g.boxes[k]);
        let next = moveGroup(boxes, dx, dy, page);
        let active: SnapLine[] = [];
        if (showGrid) {
          const frame = boundingBox(next)!;
          const snapped = snapToGrid(frame, GRID_MM);
          next = next.map((b) => ({ ...b, x: b.x + snapped.x - frame.x, y: b.y + snapped.y - frame.y }));
        } else if (snapping && !e.altKey) {
          g.lines ??= snapCandidates(layout, new Set(ids), page);
          const frame = boundingBox(next)!;
          // Порог — в пикселях экрана: в миллиметрах он на мелком масштабе
          // не срабатывал вовсе, а на крупном держал блок у линии слишком долго.
          const result = snapBox(frame, g.lines, SNAP_PX / (PX_PER_MM * zoom));
          next = next.map((b) => ({ ...b, x: b.x + result.box.x - frame.x, y: b.y + result.box.y - frame.y }));
          active = result.active;
        }
        showGuides(active);
        updateBoxes(Object.fromEntries(ids.map((k, i) => [k, next[i]])), false);
        return;
      }

      if (g.kind === 'resize') {
        const proportional = g.handle.length === 2 && (g.keepRatio || e.shiftKey);
        let next = proportional
          ? scaleGroup([g.box], g.box, g.handle, dx, dy, page).boxes[0]
          : resizeBox(g.box, g.handle, dx, dy, page.w, page.h);
        // Сетка округляет стороны порознь — пропорции она бы сломала.
        if (showGrid && !proportional) next = snapToGrid(next, GRID_MM);
        if (g.square) next = squareBox(g.box, next, g.handle, page.w, page.h);
        updateBoxes({ [g.id]: next }, false);
        return;
      }

      if (g.kind === 'scale') {
        const ids = Object.keys(g.boxes);
        const { boxes, scale } = scaleGroup(ids.map((k) => g.boxes[k]), g.frame, g.handle, dx, dy, page);
        const next = Object.fromEntries(ids.map((k, i) => [k, boxes[i]]));
        // Кегли — в той же пропорции: композиция уменьшается целиком.
        setLayout(
          (prev) =>
            prev.map((el) =>
              next[el.id]
                ? el.type === 'text'
                  ? { ...el, ...roundBox(next[el.id]), props: { ...el.props, fontSize: Math.max(4, Math.round(g.sizes[el.id] * scale * 2) / 2) } }
                  : { ...el, ...roundBox(next[el.id]) }
                : el,
            ),
          false,
        );
        return;
      }

      if (g.kind === 'rotate') {
        const rotation = rotationFromPointer(g.center, { x: e.clientX, y: e.clientY }, e.shiftKey ? 15 : null);
        patchElements(new Set([g.id]), (el) => ({ ...el, rotation }), false);
      }
    }

    function flush() {
      frameId = 0;
      const e = pending;
      pending = null;
      if (e) apply(e);
    }

    function onMove(e: PointerEvent) {
      if (!gesture.current) return;
      pending = e;
      if (!frameId) frameId = requestAnimationFrame(flush);
    }

    function onUp() {
      // Последнее движение — сразу, а не в следующем кадре: иначе блок
      // встал бы на шаг раньше того места, где его отпустили.
      if (frameId) cancelAnimationFrame(frameId);
      flush();
      const g = gesture.current;
      if (g?.kind === 'marquee') setMarquee(null);
      // Без этого перетаскивание не попадало бы в автосохранение:
      // промежуточные кадры намеренно не двигают счётчик версии.
      else if (g?.moved) endGesture();
      showGuides([]);
      gesture.current = null;
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      if (frameId) cancelAnimationFrame(frameId);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [beginGesture, endGesture, setLayout]);

  /* ────────────────────────────── горячие клавиши ──────────────────────── */

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const typing =
        target instanceof HTMLElement &&
        (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable);
      if (typing) return;
      if (!doc.data) return;
      const page = { w: doc.data.pageWidthMm, h: doc.data.pageHeightMm };
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();

      if (mod && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) history.redo();
        else history.undo();
        return;
      }
      if (mod && key === 'y') {
        e.preventDefault();
        history.redo();
        return;
      }
      if (mod && key === 'a') {
        e.preventDefault();
        setSelected(new Set(selectableIds(layout)));
        return;
      }
      if (e.key === 'Escape') {
        setSelected(new Set());
        return;
      }
      if (selected.size === 0) return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        removeSelected();
        return;
      }
      if (e.key === 'Enter' && selectedElements.length === 1 && selectedElements[0].type === 'text') {
        e.preventDefault();
        setEditingId(selectedElements[0].id);
        return;
      }
      if (mod && key === 'd') {
        e.preventDefault();
        cloneInto(selectedElements);
        return;
      }
      if (mod && key === 'c') {
        clipboard.current = selectedElements.map((el) => structuredClone(el));
        return;
      }
      if (mod && key === 'x') {
        clipboard.current = selectedElements.map((el) => structuredClone(el));
        removeSelected();
        return;
      }
      if (mod && key === 'v') {
        if (clipboard.current.length) cloneInto(clipboard.current);
        return;
      }
      if (mod && key === 'g') {
        e.preventDefault();
        const groupId = e.shiftKey ? null : crypto.randomUUID();
        patchElements(selected, (el) => ({ ...el, groupId }));
        return;
      }
      if (mod && (key === 'b' || key === 'i' || key === 'u')) {
        e.preventDefault();
        const prop = key === 'b' ? 'bold' : key === 'i' ? 'italic' : 'underline';
        const on = selectedElements.some((el) => el.type === 'text' && !el.props[prop]);
        patchTextProps({ [prop]: on });
        return;
      }
      if (mod && (key === 'l' || key === 'r' || key === 'e')) {
        e.preventDefault();
        patchTextProps({ align: key === 'l' ? 'left' : key === 'r' ? 'right' : 'center' });
        return;
      }
      if (e.key.startsWith('Arrow')) {
        e.preventDefault();
        const step = (e.shiftKey ? 10 : 1) * NUDGE_MM;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        patchElements(selected, (el) => (el.locked ? el : { ...el, ...roundBox(nudgeBox(el, dx, dy, page)) }));
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [history, selected, selectedElements, layout, doc.data, removeSelected, cloneInto, patchElements, patchTextProps]);

  // Проверка стоит после всех хуков намеренно: ранний выход выше сломал бы
  // их порядок между отрисовками.
  if (moved) return <Navigate to={moved} replace />;

  if (doc.isPending) return <div className="p-6 text-[var(--text-muted)]">Загрузка документа…</div>;
  if (doc.isError) {
    return (
      <ErrorState
        title="Документ не открылся"
        onRetry={() => void doc.refetch()}
        retrying={doc.isFetching}
        code={String(doc.error)}
      />
    );
  }
  if (!doc.data || !sheet) return <div className="p-6 text-[var(--text-muted)]">Документ не найден</div>;

  const page = doc.data;
  const pageBox = { w: page.pageWidthMm, h: page.pageHeightMm };

  /**
   * Добавляет блок в середину листа.
   *
   * Свойства прогоняем через схему, а не задаём вручную: умолчания живут
   * в одном месте, и новый блок гарантированно такой же, каким его увидит
   * печать. Иначе редактор и рендер разошлись бы на первом же новом поле.
   */
  /** Точка листа в мм под указателем — для вставки туда, куда кликнули. */
  function pointOnSheet(e: { clientX: number; clientY: number }) {
    const rect = sheetRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return { x: (e.clientX - rect.left) / (PX_PER_MM * zoom), y: (e.clientY - rect.top) / (PX_PER_MM * zoom) };
  }

  function addElement(what: InsertKind, at?: { x: number; y: number } | null) {
    const size =
      what.type === 'text'
        ? { w: 120, h: 20 }
        : what.type === 'qr'
          ? { w: 30, h: 30 }
          : what.type === 'link'
            ? { w: 80, h: 10 }
            : what.kind === 'line'
              ? { w: 80, h: 2 }
              : what.kind === 'rect'
                ? { w: 60, h: 40 }
                : { w: 40, h: 40 };

    const seed: Record<string, unknown> =
      what.type === 'text'
        ? what.field
          ? { doc: docWithField(what.field.source, what.field.fieldId) }
          : { text: 'Награждается %name' }
        : what.type === 'link'
          ? { url: 'https://vruchay.ru' }
          : what.type === 'shape'
            ? { kind: what.kind, strokeWidth: what.kind === 'line' ? 0.5 : 0.5, fill: null }
            : {};

    const maxZ = Math.max(-1, ...layout.map((el) => el.z));
    const el = sheetLayout.parse([
      {
        id: crypto.randomUUID(),
        type: what.type,
        x: at ? clamp(at.x, 0, page.pageWidthMm - size.w) : page.pageWidthMm / 2 - size.w / 2,
        y: at ? clamp(at.y, 0, page.pageHeightMm - size.h) : page.pageHeightMm / 2 - size.h / 2,
        w: size.w,
        h: size.h,
        rotation: 0,
        z: maxZ + 1,
        props: seed,
      },
    ])[0];

    history.setLayout((prev) => [...prev, el]);
    setSelected(new Set([el.id]));
    // Блок, вставленный из панели полей, не уводит из неё к свойствам.
    if (!fieldsOpen) setOtherPanel('props');
    return el;
  }

  /**
   * Картинка отдельным блоком: сначала файл на сервер, потом блок с его
   * `fileId`. Наоборот нельзя — макет с картинкой, которой ещё нет,
   * сервер не сохранит. `at` — куда бросили файл; без него — середина листа.
   */
  async function addImage(file: File, at?: { x: number; y: number }) {
    const size = await readImageSize(file).catch(() => null);
    const uploaded = await uploadImage.mutateAsync(file).catch(() => null);
    if (!uploaded) return;

    const box = insertedImageBox(size, pageBox, at);
    const elementId = crypto.randomUUID();
    history.setLayout((prev) => {
      const maxZ = Math.max(-1, ...prev.map((el) => el.z));
      const [el] = sheetLayout.parse([
        { id: elementId, type: 'image', ...box, rotation: 0, z: maxZ + 1, props: { fileId: uploaded.fileId } },
      ]);
      return [...prev, el];
    });
    setSelected(new Set([elementId]));
    if (!fieldsOpen) setOtherPanel('props');
  }

  /**
   * Смена размера листа с подстройкой блоков — по выбранному в диалоге
   * способу. Вылезшие блоки после этого выделены: человек сразу видит,
   * что поправить, а не ищет их по листу.
   */
  function applyResize(mode: ResizeMode) {
    if (!resizeTo) return;
    const from = pageBox;
    const to = { w: resizeTo.widthMm, h: resizeTo.heightMm };
    const result = resizeLayout(layout, from, to, mode);
    if (result.layout !== layout) history.setLayout(result.layout);
    resizePage.mutate(resizeTo);
    setSelected(new Set(result.overflowing));
    setResizeTo(null);
  }

  function align(kind: AlignKind) {
    const items = selectedElements.filter((el) => !el.locked);
    if (!items.length) return;
    const frame = items.length > 1 ? boundingBox(items)! : { x: 0, y: 0, ...pageBox };
    const boxes = alignBoxes(items, kind, frame);
    updateBoxes(Object.fromEntries(items.map((el, i) => [el.id, boxes[i]])), true);
  }

  function distribute(axis: 'h' | 'v') {
    const items = selectedElements.filter((el) => !el.locked);
    const boxes = distributeBoxes(items, axis);
    updateBoxes(Object.fromEntries(items.map((el, i) => [el.id, boxes[i]])), true);
  }

  function applyStyleToAll() {
    const source = selectedElements.find((el): el is TextElement => el.type === 'text');
    if (!source) return;
    const { fontFamily, color } = source.props;
    history.setLayout((prev) =>
      prev.map((el) => (el.type === 'text' ? { ...el, props: { ...el.props, fontFamily, color } } : el)),
    );
  }

  function startMove(e: React.PointerEvent, el: SheetElement) {
    e.preventDefault();
    e.stopPropagation();
    if (editingId && editingId !== el.id) setEditingId(null);
    const additive = e.shiftKey;
    // Что окажется выделенным после этого клика — считаем сразу, чтобы жест
    // вёл именно эту группу, а не ту, что была до клика.
    let next: ReadonlySet<string>;
    if (additive) {
      const base = new Set(selected);
      if (base.has(el.id)) base.delete(el.id);
      else base.add(el.id);
      next = expandToGroups(layout, base);
    } else {
      next = selected.has(el.id) ? selected : expandToGroups(layout, [el.id]);
    }
    setSelected(next);
    // Правая кнопка только выделяет: перетаскивают левой, а правой
    // открывают настройки поля (onContextMenu на слое жестов).
    if (el.locked || e.button !== 0) return;
    const boxes: Record<string, Box> = {};
    for (const item of layout) {
      if (next.has(item.id) && !item.locked) boxes[item.id] = { x: item.x, y: item.y, w: item.w, h: item.h };
    }
    gesture.current = { kind: 'move', boxes, startX: e.clientX, startY: e.clientY, moved: false };
  }

  function startMarquee(e: React.PointerEvent) {
    if (e.button !== 0) return;
    setEditingId(null);
    if (!e.shiftKey) setSelected(new Set());
    gesture.current = { kind: 'marquee', additive: e.shiftKey, base: selected, startX: e.clientX, startY: e.clientY, moved: false };
  }

  const frame = selectedElements.length > 1 ? boundingBox(selectedElements) : null;
  const single = selectedElements.length === 1 ? selectedElements[0] : null;
  const px = (mm: number) => mm * PX_PER_MM * zoom;
  const dataMode = viewMode === 'data';

  /** Значок панели работает переключателем: второе нажатие её закрывает. */

  const hasBackground = Boolean(sheet.backgroundFileId);
  const pickBackground = () => backgroundInput.current?.click();
  const pickImage = () => imageInput.current?.click();

  /*
   * Меню «…» листа: действия над материалом целиком и редкие правки.
   * Всё, чем пользуются постоянно, стоит значком на панели; вставка —
   * в своём меню там же, а стороны материала — в ленте вкладок.
   */
  const actions: MenuEntry[] = [
    ...fileMenu.entries,
    {
      icon: <Table2 size={16} />,
      label: 'Открыть таблицу',
      onSelect: () => navigate(workspacePath(id)),
    },
    { separator: true },
    {
      icon: <SquareDashed size={16} />,
      label: 'Выделить всё',
      shortcut: 'Ctrl+A',
      onSelect: () => setSelected(new Set(selectableIds(layout))),
    },
    {
      icon: <CopyPlus size={16} />,
      label: 'Дублировать',
      shortcut: 'Ctrl+D',
      disabled: selectedElements.length === 0,
      onSelect: () => cloneInto(selectedElements),
    },
    {
      icon: <Paintbrush size={16} />,
      label: 'Копировать стиль',
      disabled: !selectedElements.some((el) => el.type === 'text'),
      onSelect: () => {
        const source = selectedElements.find((el): el is TextElement => el.type === 'text');
        if (source) setStyleClipboard(pickTextStyle(source.props));
      },
    },
    {
      icon: <Paintbrush size={16} />,
      label: 'Вставить стиль',
      disabled: styleClipboard === null || selected.size === 0,
      onSelect: () => styleClipboard && patchTextProps(styleClipboard),
    },
    { separator: true },
    {
      icon: <Trash2 size={16} />,
      label: 'Удалить',
      shortcut: 'Delete',
      danger: true,
      disabled: selected.size === 0,
      onSelect: removeSelected,
    },
  ];

  /*
   * Панель значков под меню — только то, чем пользуются постоянно: отмена,
   * вставка, панели справа, помощь при расстановке и масштаб. Всё остальное
   * живёт в меню, где у действия есть слово.
   */
  const toolbar = (
    <>
      <ToolButton title="Отменить (Ctrl+Z)" onClick={history.undo} disabled={!history.canUndo}>
        <Undo2 size={16} />
      </ToolButton>
      <ToolButton title="Повторить (Ctrl+Shift+Z)" onClick={history.redo} disabled={!history.canRedo}>
        <Redo2 size={16} />
      </ToolButton>

      <ToolDivider />

      <InsertMenu
        iconOnly
        onInsert={addElement}
        fields={fields}
        onBackground={pickBackground}
        backgroundLoading={uploadBackground.isPending}
        hasBackground={hasBackground}
        onImage={pickImage}
        imageLoading={uploadImage.isPending}
      />
      <ToolButton
        title={hasBackground ? 'Заменить бланк' : 'Загрузить бланк'}
        onClick={pickBackground}
        disabled={uploadBackground.isPending}
      >
        <ImageUp size={16} />
      </ToolButton>

      <ToolDivider />

      <ToolButton
        title="Сетка 5 мм"
        active={showGrid}
        onClick={() => setShowGrid((v) => !v)}
      >
        <Grid3x3 size={16} />
      </ToolButton>
      <ToolButton
        title="Привязка к краям и центрам (Alt — отключить на время)"
        active={snapping}
        onClick={() => setSnapping((v) => !v)}
      >
        <Magnet size={16} />
      </ToolButton>
      <ToolButton
        title="Поля печати: обрез 3 мм, поле принтера 5 мм"
        active={showSafeArea}
        onClick={() => setShowSafeArea((v) => !v)}
      >
        <Printer size={16} />
      </ToolButton>

      <ToolDivider />

      <ToolButton title="Формат листа" onClick={() => setSizeOpen(true)}>
        <Proportions size={16} />
      </ToolButton>

      {/* Масштаб — одним списком, как в любом редакторе: «вписать» и
          круглые проценты. Текущее значение — подпись закрытой кнопки,
          в сам список не входит: список — не состояние, а команды. */}
      <Select
        aria-label="Масштаб"
        title="Масштаб. Ещё: Ctrl+колёсико — масштаб, пробел — перетаскивание холста"
        value=""
        placeholder={`${Math.round(zoom * 100)}%`}
        onChange={(v) => {
          if (v === 'fit' || v === 'width' || v === 'height' || v === 'actual') zoomTo(v);
          else setZoom(clamp(Number(v) / 100, 0.25, 4));
        }}
        options={[
          { value: 'fit', label: 'Вписать в окно' },
          { value: 'width', label: 'По ширине' },
          { value: 'height', label: 'По высоте' },
          { value: '50', label: '50%' },
          { value: '75', label: '75%' },
          { value: 'actual', label: '100%' },
          { value: '150', label: '150%' },
          { value: '200', label: '200%' },
        ]}
        className="tabular h-8 w-auto py-0 pr-7 pl-2 text-sm"
      />

      <div className="ml-auto flex items-center gap-2">
        <StatusChip
          tone={
            saved === 'saved'
              ? 'done'
              : saved === 'saving'
                ? 'progress'
                : saved === 'error'
                  ? 'error'
                  : 'neutral'
          }
        >
          {saved === 'saved' ? (
            <>
              <Check size={13} /> Сохранено
            </>
          ) : saved === 'saving' ? (
            <>
              <LoaderCircle size={13} className="animate-spin" /> Сохраняем
            </>
          ) : saved === 'error' ? (
            <>
              <TriangleAlert size={13} /> Не удалось сохранить
            </>
          ) : (
            <>
              <Dot size={13} /> Есть правки
            </>
          )}
        </StatusChip>
      </div>
    </>
  );

  return (
    // Высота — точным счётом, а не `h-full`: оболочка кабинета больше не
    // задаёт высоту своей колонке (это ломало прилипание разделов на
    // длинных страницах, см. AppShell), и опереться на неё через `h-full`
    // стало не на что. Лист по-прежнему получает ровно экран без шапки.
    <div className="flex h-[calc(100dvh-var(--app-header))] flex-col">
      <DocumentChrome
        documentId={id}
        title={page.title}
        actions={actions}
        tab="sheet"
        toolbar={toolbar}
      />

      {/* Поле выбора файла спрятано и живёт отдельно от меню: меню
          закрывается по нажатию, а системное окно выбора должно открыться
          уже после этого — иначе оно закрылось бы вместе с меню. */}
      <input
        ref={backgroundInput}
        type="file"
        accept="image/png,image/jpeg"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void onPickBackground(file);
          e.target.value = '';
        }}
      />
      <input
        ref={imageInput}
        type="file"
        accept="image/png,image/jpeg"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void addImage(file);
          e.target.value = '';
        }}
      />

      {/* Разговор про бланк — строкой под панелью, а не в самой панели:
          в ряду значков длинная фраза ломала строку и сдвигала всё
          остальное. */}
      {(uploadBackground.error ?? uploadImage.error) && (
        <p
          role="alert"
          className="shrink-0 border-b border-[var(--line)] bg-[var(--danger-soft)] px-4 py-2 text-sm text-[var(--danger)]"
        >
          {(uploadBackground.error ?? uploadImage.error)!.message}
        </p>
      )}
      {backgroundNote && (
        <p
          role="status"
          className="shrink-0 border-b border-[var(--line)] bg-[var(--surface-sunken)] px-4 py-2 text-sm text-[var(--text-muted)]"
        >
          {backgroundNote}{' '}
          <button type="button" onClick={() => setBackgroundNote(null)} className="underline">
            понятно
          </button>
        </p>
      )}

      <div className="flex min-h-0 flex-1">
        <div
          ref={containerRef}
          // Граница для панели оформления текста: за холст она не выходит.
          data-canvas
          className="relative grid flex-1 place-items-center overflow-auto bg-[var(--surface-sunken)] p-6"
          style={panning ? { cursor: pan.current ? 'grabbing' : 'grab' } : undefined}
          onPointerDownCapture={(e) => {
            if (!panning) return;
            e.preventDefault();
            e.stopPropagation();
            const el = containerRef.current!;
            pan.current = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop };
          }}
          onPointerMoveCapture={(e) => {
            if (!pan.current) return;
            const el = containerRef.current!;
            el.scrollLeft = pan.current.left - (e.clientX - pan.current.x);
            el.scrollTop = pan.current.top - (e.clientY - pan.current.y);
          }}
          onPointerUpCapture={() => {
            pan.current = null;
          }}
          // Файл, брошенный на холст, становится картинкой в точке броска.
          // Перетаскивание поля из панели сюда не попадает: у него нет файлов.
          onDragOver={(e) => {
            if (!e.dataTransfer.types.includes('Files')) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
            if (!fileOver) setFileOver(true);
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFileOver(false);
          }}
          onDrop={(e) => {
            const file = e.dataTransfer.files[0];
            if (!file) return;
            e.preventDefault();
            setFileOver(false);
            void addImage(file, pointToMm(e.clientX, e.clientY));
          }}
        >
          {!sheet.backgroundFileId && layout.length === 0 && (
            <div className="absolute inset-x-0 top-6 z-10 flex justify-center px-6">
              <div className="max-w-sm rounded-2xl bg-[var(--surface)] px-5 py-4 text-center shadow-sm ring-1 ring-[var(--line)]">
                <p className="font-medium">Лист пока пустой</p>
                <p className="mt-1 text-sm text-[var(--text-muted)]">
                  Загрузите свой бланк фоном, а поверх поставьте текст: «Вставка» →
                  «Загрузить бланк», потом «Добавить текстовый блок». Фамилия и другие
                  колонки списка подставляются переменными вида %name.
                </p>
              </div>
            </div>
          )}
          {sheet.backgroundFileId && layout.length === 0 && (
            <div className="pointer-events-none absolute inset-x-0 top-6 z-10 flex justify-center">
              <p className="rounded-full bg-[var(--surface)] px-4 py-2 text-sm text-[var(--text-muted)] shadow-sm ring-1 ring-[var(--line)]">
                Бланк на месте. Теперь «Вставка» → «Добавить текстовый блок».
              </p>
            </div>
          )}

          <div className="relative" style={{ padding: 18 }}>
            {/* Линейки в миллиметрах — по краям листа. */}
            <Ruler axis="x" lengthMm={page.pageWidthMm} zoom={zoom} />
            <Ruler axis="y" lengthMm={page.pageHeightMm} zoom={zoom} />

            <div
              ref={sheetRef}
              className={`relative shadow-[var(--shadow-sheet)] ${fileOver ? 'ring-2 ring-[var(--accent)]' : ''}`}
              style={{ width: px(page.pageWidthMm), height: px(page.pageHeightMm) }}
              onPointerDown={startMarquee}
              // Двойной клик по пустому месту — новый текст прямо там,
              // как в Miro и Excalidraw. По блокам событие не доходит.
              onDoubleClick={(e) => {
                if (dataMode) return;
                const el = addElement({ type: 'text' }, pointOnSheet(e));
                if (el?.type === 'text') setEditingId(el.id);
              }}
              onContextMenu={(e) => {
                if (dataMode) return;
                e.preventDefault();
                const mm = pointOnSheet(e);
                if (mm) setCanvasMenu({ x: e.clientX, y: e.clientY, mm });
              }}
            >
              <div style={{ transform: `scale(${zoom})`, transformOrigin: 'top left' }}>
                <SheetRenderer
                  layout={layout}
                  pageWidthMm={page.pageWidthMm}
                  pageHeightMm={page.pageHeightMm}
                  backgroundUrl={background.data?.url}
                  data={previewData}
                  unfilled={dataMode ? 'blank' : 'token'}
                  fields={dataMode ? 'highlight' : 'chip'}
                  knownFields={known}
                  fieldLabels={labels}
                  selectedIds={selected}
                  onSelect={(elementId, additive) => elementId && select(elementId, additive)}
                  onEdit={(elementId) => setEditingId(elementId)}
                  editingId={editingId}
                  renderEditing={(element) => (
                    <InlineTextEditor
                      key={element.id}
                      element={element}
                      fields={fields}
                      data={previewData}
                      known={known}
                      labels={labels}
                      onEditor={(editor) => {
                        liveEditor.current = editor;
                      }}
                      onChange={(richDoc) => setDoc(element.id, richDoc, false)}
                      openField={openField}
                      onDone={(richDoc) => {
                        setOpenField(null);
                        liveEditor.current = null;
                        setDoc(element.id, richDoc, true);
                        setEditingId(null);
                      }}
                    />
                  )}
                />
              </div>

              {showGrid && (
                <div
                  className="pointer-events-none absolute inset-0"
                  style={{
                    backgroundImage:
                      'linear-gradient(to right, rgba(0,0,0,0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,0.08) 1px, transparent 1px)',
                    backgroundSize: `${px(GRID_MM)}px ${px(GRID_MM)}px`,
                  }}
                />
              )}

              {/* Безопасные поля печати: обрез 3 мм и поле принтера 5 мм.
                  Всё, что ближе к краю, рискует быть срезанным. */}
              {showSafeArea && (
                <>
                  <div
                    className="pointer-events-none absolute border border-dashed border-[var(--danger)]/70"
                    style={{ inset: px(BLEED_MM) }}
                  />
                  <div
                    className="pointer-events-none absolute border border-dashed border-[var(--accent)]/70"
                    style={{ inset: px(SAFE_MARGIN_MM) }}
                  />
                </>
              )}

              {/* Направляющие, к которым прилип двигаемый блок. */}
              {guides.map((g, i) => (
                <div
                  key={i}
                  className="pointer-events-none absolute bg-[var(--accent)]"
                  style={
                    g.axis === 'x'
                      ? { left: px(g.at), top: 0, width: 1, height: '100%' }
                      : { top: px(g.at), left: 0, height: 1, width: '100%' }
                  }
                />
              ))}

              {/* Слой жестов поверх листа: рамки выделения и ручки. */}
              {layout
                .filter((el) => !el.hidden)
                .map((el) => {
                  const isSelected = selected.has(el.id);
                  const editing = editingId === el.id;
                  return (
                    <div
                      key={el.id}
                      onPointerDown={(e) => startMove(e, el)}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        if (el.type === 'text' && !el.locked) {
                          setOpenField(null);
                          setEditingId(el.id);
                        }
                      }}
                      onContextMenu={(e) => {
                        // Меню вставки — только для пустого места листа.
                        e.stopPropagation();
                        if (el.type !== 'text' || el.locked) return;
                        // Слой жестов лежит поверх текста, поэтому фишку под
                        // указателем ищем по координатам, а не по цели события.
                        const chips = Array.from(
                          document.querySelectorAll(`[data-element-id="${CSS.escape(el.id)}"] [data-field]`),
                        );
                        const hit = document
                          .elementsFromPoint(e.clientX, e.clientY)
                          .find((node) => chips.includes(node));
                        if (!hit) return;
                        e.preventDefault();
                        setSelected(new Set([el.id]));
                        setOpenField(chips.indexOf(hit));
                        setEditingId(el.id);
                      }}
                      onDragOver={(e) => {
                        if (el.type === 'text' && e.dataTransfer.types.includes(FIELD_DRAG_TYPE)) e.preventDefault();
                      }}
                      onDrop={(e) => {
                        if (el.type !== 'text') return;
                        const raw = e.dataTransfer.getData(FIELD_DRAG_TYPE);
                        if (!raw) return;
                        e.preventDefault();
                        const { source, fieldId } = JSON.parse(raw) as { source: string; fieldId: string | null };
                        setDoc(el.id, appendField(el.props.doc, source, fieldId), true);
                        setSelected(new Set([el.id]));
                      }}
                      style={{
                        position: 'absolute',
                        left: px(el.x),
                        top: px(el.y),
                        width: px(el.w),
                        height: px(el.h),
                        transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
                        cursor: el.locked ? 'not-allowed' : 'move',
                        pointerEvents: editing ? 'none' : undefined,
                      }}
                      className={isSelected && !frame ? (el.locked ? 'ring-2 ring-[var(--text-muted)]' : 'ring-2 ring-[var(--focus)]') : ''}
                    >
                      {single?.id === el.id && !el.locked && !editing && (
                        <>
                          {/* У картинки только углы: сторона растянула бы рамку,
                              а картинка в ней осталась бы прежней формы. */}
                          {(el.type === 'image' ? CORNERS : HANDLES).map((handle) => (
                            <span
                              key={handle}
                              onPointerDown={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                gesture.current = {
                                  kind: 'resize',
                                  id: el.id,
                                  handle,
                                  startX: e.clientX,
                                  startY: e.clientY,
                                  box: { x: el.x, y: el.y, w: el.w, h: el.h },
                                  keepRatio: el.type === 'image',
                                  square: el.type === 'qr',
                                  moved: false,
                                };
                              }}
                              style={handleStyle(handle, { x: px(el.w) < TIGHT_PX, y: px(el.h) < TIGHT_PX })}
                              className="absolute h-2.5 w-2.5 rounded-full border border-[var(--surface)] bg-[var(--focus)]"
                            />
                          ))}
                          {/* Ручка поворота — над верхним краем. Shift — с шагом в 15°. */}
                          <span
                            onPointerDown={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              const rect = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
                              gesture.current = {
                                kind: 'rotate',
                                id: el.id,
                                center: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
                                startX: e.clientX,
                                startY: e.clientY,
                                moved: false,
                              };
                            }}
                            title="Повернуть (Shift — с шагом 15°)"
                            style={{ top: -22, left: 'calc(50% - 5px)', cursor: 'grab' }}
                            className="absolute h-2.5 w-2.5 rounded-full border border-[var(--surface)] bg-[var(--accent)]"
                          />
                        </>
                      )}
                    </div>
                  );
                })}

              {/* Общая рамка группы — с угловыми ручками масштаба. */}
              {frame && (
                <div
                  className="pointer-events-none absolute ring-2 ring-[var(--focus)]"
                  style={{ left: px(frame.x), top: px(frame.y), width: px(frame.w), height: px(frame.h) }}
                >
                  {CORNERS.map((handle) => (
                    <span
                      key={handle}
                      onPointerDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const movable = selectedElements.filter((el) => !el.locked);
                        gesture.current = {
                          kind: 'scale',
                          handle,
                          frame,
                          boxes: Object.fromEntries(movable.map((el) => [el.id, { x: el.x, y: el.y, w: el.w, h: el.h }])),
                          sizes: Object.fromEntries(movable.map((el) => [el.id, el.type === 'text' ? el.props.fontSize : 0])),
                          startX: e.clientX,
                          startY: e.clientY,
                          moved: false,
                        };
                      }}
                      style={{ ...handleStyle(handle), pointerEvents: 'auto' }}
                      className="absolute h-3 w-3 rounded-sm border border-[var(--surface)] bg-[var(--focus)]"
                    />
                  ))}
                </div>
              )}

              {marquee && (
                <div
                  className="pointer-events-none absolute border border-[var(--focus)] bg-[var(--focus)]/10"
                  style={{ left: px(marquee.x), top: px(marquee.y), width: px(marquee.w), height: px(marquee.h) }}
                />
              )}
            </div>
          </div>
        </div>

        {/* Панели справа нет, пока она не нужна: лист занимает весь экран,
            как в любом редакторе документов. Открывают её значком на панели
            или первым выделенным блоком. */}
        {!panel && (
          <aside
            aria-label="Свёрнутая панель"
            className="flex w-11 shrink-0 flex-col items-center gap-1 border-l border-[var(--line)] bg-[var(--surface)] py-2"
          >
            <IconButton size="sm" label="Свойства" onClick={() => setPanel('props')}>
              <SlidersHorizontal size={16} />
            </IconButton>
            <IconButton size="sm" label="Данные" onClick={() => setPanel('fields')} className="relative">
              <Variable size={16} />
              {matches.length > 0 && (
                <span className="absolute right-1 top-1 size-2 rounded-full bg-[var(--accent)]" />
              )}
            </IconButton>
            <IconButton size="sm" label="Слои" onClick={() => setPanel('layers')}>
              <Layers size={16} />
            </IconButton>
          </aside>
        )}
        {panel && (
          <aside className="flex w-80 shrink-0 flex-col border-l border-[var(--line)] bg-[var(--surface)]">
            <div className="flex border-b border-[var(--line)]">
              <Tab active={panel === 'props'} onClick={() => setPanel('props')} icon={<SlidersHorizontal size={14} />}>
                Свойства
              </Tab>
              <Tab active={panel === 'fields'} onClick={() => setPanel('fields')} icon={<Variable size={14} />} badge={matches.length || undefined}>
                Данные
              </Tab>
              <Tab active={panel === 'layers'} onClick={() => setPanel('layers')} icon={<Layers size={14} />}>
                Слои
              </Tab>
              <IconButton size="sm" label="Свернуть панель" onClick={() => setPanel(null)} className="m-1 shrink-0">
                <ChevronsRight size={15} />
              </IconButton>
            </div>
            {panel === 'fields' ? (
              <FieldsList
                header={
                  <SheetView
                    dataMode={dataMode}
                    onMode={(mode) => setViewMode(mode)}
                    row={safeRow}
                    rowCount={rowCount}
                    onRow={setRowIndex}
                  />
                }
                fields={fields}
                samples={previewData}
                action={{ label: 'Вставить', run: insertField }}
                draggable
                notice={
                  matches.length > 0 ? (
                    <div className="rounded-lg bg-[var(--warn-soft)] p-2.5 text-[13px] leading-5">
                      <p>
                        {matches.length === 1 ? 'Поле макета не нашло колонку' : 'Поля макета не нашли колонки'}:{' '}
                        {matches.map((m) => `«${m.from}» → «${m.to.name}»`).join(', ')}.
                      </p>
                      <Button
                        size="sm"
                        variant="primary"
                        icon={<Wand2 size={14} />}
                        onClick={() => history.setLayout(applyMatches(layout, matches))}
                        className="mt-2"
                      >
                        Сопоставить
                      </Button>
                    </div>
                  ) : undefined
                }
                onCreate={async (title) => {
                  const field = fieldFromColumn(await recipientMutations.addColumn.mutateAsync({ title }));
                  // В выделенный текст — сразу: ради этого поле обычно и
                  // заводят. Без выделения новый блок посреди листа был бы
                  // сюрпризом, поэтому поле просто появляется в списке.
                  if (canInsertIntoText) insertField(field);
                  return field;
                }}
              />
            ) : (
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
                {panel === 'props' && (
                  <PropertiesPanel
                    elements={selectedElements}
                    page={pageBox}
                    doc={doc.data}
                    layout={layout}
                    onSaveEvent={(values) => saveEvent.mutate(values)}
                    onEventDraft={setEventDraft}
                    onResizePage={(size) => setResizeTo(size)}
                    onTextProps={patchTextProps}
                    onShapeProps={patchShapeProps}
                    onQrProps={patchQrProps}
                    onLinkProps={patchLinkProps}
                    onElement={(patch, commit) => patchElements(selected, (el) => ({ ...el, ...patch }) as SheetElement, commit)}
                    onBox={(elementId, box) => {
                      const safe = { ...box, w: Math.max(box.w, 5), h: Math.max(box.h, 5) };
                      updateBoxes({ [elementId]: moveBox(safe, 0, 0, pageBox.w, pageBox.h) }, true);
                    }}
                    onAlign={align}
                    onDistribute={distribute}
                    onGroup={() => {
                      const groupId = crypto.randomUUID();
                      patchElements(selected, (el) => ({ ...el, groupId }));
                    }}
                    onUngroup={() => patchElements(selected, (el) => ({ ...el, groupId: null }))}
                    onLayer={(where) => {
                      let next = layout;
                      for (const elementId of selected) next = moveLayer(next, elementId, where);
                      history.setLayout(next);
                    }}
                    onApplyStyleToAll={applyStyleToAll}
                    onCopyStyle={() => {
                      const source = selectedElements.find((el): el is TextElement => el.type === 'text');
                      if (source) setStyleClipboard(pickTextStyle(source.props));
                    }}
                    onPasteStyle={() => styleClipboard && patchTextProps(styleClipboard)}
                    hasStyleClipboard={styleClipboard !== null}
                    onDelete={removeSelected}
                  />
                )}
                {panel === 'layers' && (
                  <LayersPanel
                    layout={layout}
                    selected={selected}
                    onSelect={(elementId, additive) => select(elementId, additive)}
                    onChange={(next: SheetLayout) => history.setLayout(next)}
                  />
                )}
              </div>
            )}
          </aside>
        )}
      </div>

      {/* Закладки листов — внизу, как в любом редакторе страниц. */}
      <SheetTabs
        sheets={sheets}
        activeId={sheet.id}
        onSelect={(sheetId) => {
          setSelected(new Set());
          setEditingId(null);
          setActiveSheetId(sheetId);
        }}
        onAdd={() => addSheet.mutate()}
        onDelete={(sheetId) => deleteSheet.mutate(sheetId)}
        adding={addSheet.isPending}
      />

      {fileMenu.dialogs}

      {sizeOpen && (
        <PageSizeDialog
          current={{ widthMm: page.pageWidthMm, heightMm: page.pageHeightMm }}
          onApply={(size) => {
            setSizeOpen(false);
            // Что делать с блоками — вопрос следующего диалога, он же
            // и применяет размер: тот же путь, что из панели свойств.
            setResizeTo(size);
          }}
          onClose={() => setSizeOpen(false)}
        />
      )}

      {canvasMenu && (
        <CanvasMenu
          at={canvasMenu}
          canPaste={clipboard.current.length > 0}
          onInsert={(what) => addElement(what, canvasMenu.mm)}
          onImage={pickImage}
          onPaste={() => cloneInto(clipboard.current)}
          onClose={() => setCanvasMenu(null)}
        />
      )}
      {resizeTo && (
        <ResizeDialog
          from={{ widthMm: page.pageWidthMm, heightMm: page.pageHeightMm }}
          to={resizeTo}
          onApply={applyResize}
          onCancel={() => setResizeTo(null)}
        />
      )}

      {fit && (
        <FitPageDialog
          current={{ widthMm: page.pageWidthMm, heightMm: page.pageHeightMm }}
          suggested={fit.suggested}
          onFit={() => {
            resizePage.mutate(fit.suggested);
            setFit(null);
          }}
          onKeep={() => setFit(null)}
        />
      )}
    </div>
  );
}

/**
 * Ручка стоит на рамке, половиной внутри блока. По тесной стороне —
 * целиком снаружи: на мелком масштабе строка в 20 мм занимает 14 пикселей,
 * и ручки по 10 закрывали её всю — вместо сдвига блок растягивался.
 */
function handleStyle(handle: ResizeHandle, tight: { x: boolean; y: boolean } = { x: false, y: false }): React.CSSProperties {
  const vertical = handle.includes('n')
    ? tight.y ? '-11px' : '-5px'
    : handle.includes('s')
      ? tight.y ? 'calc(100% + 1px)' : 'calc(100% - 5px)'
      : 'calc(50% - 5px)';
  const horizontal = handle.includes('w')
    ? tight.x ? '-11px' : '-5px'
    : handle.includes('e')
      ? tight.x ? 'calc(100% + 1px)' : 'calc(100% - 5px)'
      : 'calc(50% - 5px)';
  const cursors: Record<ResizeHandle, string> = {
    nw: 'nwse-resize',
    n: 'ns-resize',
    ne: 'nesw-resize',
    e: 'ew-resize',
    se: 'nwse-resize',
    s: 'ns-resize',
    sw: 'nesw-resize',
    w: 'ew-resize',
  };
  return { top: vertical, left: horizontal, cursor: cursors[handle] };
}

/** Линейка в миллиметрах: штрих каждые 5 мм, число каждые 50. */
function Ruler({ axis, lengthMm, zoom }: { axis: 'x' | 'y'; lengthMm: number; zoom: number }) {
  const ticks: number[] = [];
  for (let mm = 0; mm <= lengthMm; mm += 5) ticks.push(mm);
  const px = (mm: number) => mm * PX_PER_MM * zoom;
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute text-[9px] text-[var(--text-muted)]"
      style={
        axis === 'x'
          ? { left: 18, top: 0, width: px(lengthMm), height: 18 }
          : { top: 18, left: 0, height: px(lengthMm), width: 18 }
      }
    >
      {ticks.map((mm) => {
        const major = mm % 50 === 0;
        const size = major ? 10 : mm % 10 === 0 ? 6 : 3;
        return (
          <span
            key={mm}
            className="absolute bg-[var(--line-strong)]"
            style={
              axis === 'x'
                ? { left: px(mm), bottom: 0, width: 1, height: size }
                : { top: px(mm), right: 0, height: 1, width: size }
            }
          >
            {major && mm > 0 && (
              <span
                className="absolute"
                style={axis === 'x' ? { left: 2, bottom: 6 } : { top: -12, right: 12, transform: 'rotate(-90deg)' }}
              >
                {mm}
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}

/**
 * Что показывать на листе — в шапке панели полей.
 *
 * Раньше это был переключатель «Заготовка / Данные строки» на панели
 * инструментов, рядом с отдельной кнопкой «Поля»: две кнопки про одни
 * и те же поля. Слово «заготовка» не объясняло, что на листе окажутся
 * названия полей, — теперь так и написано.
 */
function SheetView({
  dataMode,
  onMode,
  row,
  rowCount,
  onRow,
}: {
  dataMode: boolean;
  onMode: (mode: 'placeholders' | 'data') => void;
  row: number;
  rowCount: number;
  onRow: (row: number) => void;
}) {
  const option = (active: boolean) =>
    `h-7 rounded-md px-2 text-[13px] transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
      active
        ? 'bg-[var(--surface)] font-medium text-[var(--text)] shadow-[var(--shadow-sm,0_1px_2px_rgba(12,43,100,0.12))]'
        : 'text-[var(--text-muted)] hover:text-[var(--text)]'
    }`;
  return (
    <div className="shrink-0 border-b border-[var(--line)] px-3 pb-3 pt-2.5">
      <p className="mb-1.5 text-xs font-medium text-[var(--text-muted)]">На листе показывать</p>
      <div role="radiogroup" aria-label="На листе показывать" className="grid grid-cols-2 gap-0.5 rounded-lg bg-[var(--surface-sunken)] p-0.5">
        <button type="button" role="radio" aria-checked={!dataMode} onClick={() => onMode('placeholders')} className={option(!dataMode)}>
          Названия полей
        </button>
        <Tooltip label={rowCount === 0 ? 'Список получателей пока пустой' : undefined}>
          <button
            type="button"
            role="radio"
            aria-checked={dataMode}
            disabled={rowCount === 0}
            onClick={() => onMode('data')}
            className={`w-full ${option(dataMode)}`}
          >
            Данные из таблицы
          </button>
        </Tooltip>
      </div>
      {dataMode && rowCount > 0 && (
        <div className="mt-2 flex items-center justify-between">
          <IconButton size="sm" label="Предыдущая строка" disabled={row === 0} onClick={() => onRow(Math.max(0, row - 1))}>
            <ChevronLeft size={16} />
          </IconButton>
          <span className="tabular text-[13px] text-[var(--text-muted)]">
            Строка {row + 1} из {rowCount}
          </span>
          <IconButton
            size="sm"
            label="Следующая строка"
            disabled={row >= rowCount - 1}
            onClick={() => onRow(Math.min(rowCount - 1, row + 1))}
          >
            <ChevronRight size={16} />
          </IconButton>
        </div>
      )}
    </div>
  );
}

function Tab({
  active,
  onClick,
  icon,
  badge,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  badge?: number;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-selected={active}
      role="tab"
      className={`flex flex-1 items-center justify-center gap-1.5 border-b-2 px-2 py-2 text-sm ${
        active ? 'border-[var(--accent)] text-[var(--accent)]' : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
      }`}
    >
      {icon}
      {children}
      {badge ? (
        <span className="rounded-full bg-[var(--accent)] px-1.5 text-[10px] font-medium text-[var(--accent-contrast)]">{badge}</span>
      ) : null}
    </button>
  );
}
