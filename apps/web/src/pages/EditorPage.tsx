import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Check,
  ChevronLeft,
  Dot,
  LoaderCircle,
  Redo2,
  Send,
  Undo2,
  ZoomIn,
} from 'lucide-react';
import { InsertMenu } from '../editor/InsertMenu';
import { sheetLayout, type SheetElement, type TextElement } from '@gramota/shared';
import { Button } from '../ui/Button';
import { StatusChip } from '../ui/Field';
import { api } from '../api/client';
import { useOrgProfile } from '../api/org';
import { useRecipients } from '../api/recipients';
import type { DocumentDetail } from '../api/types';
import type { EventValues } from '../editor/EventFields';
import { canvasPreviewData } from '../editor/preview-data';
import { movedViewTarget } from '../editor/moved-views';
import { workspacePath } from '../mailing/workspace-tabs';
import { SheetRenderer } from '../render/SheetRenderer';
import { PropertiesPanel } from '../editor/PropertiesPanel';
import { useLayoutHistory } from '../editor/useLayoutHistory';
import { FitPageDialog } from '../editor/FitPageDialog';
import { fitPageToImage, readImageSize, type PageFit } from '../editor/fit-page';
import {
  clamp,
  fitZoom,
  moveBox,
  PX_PER_MM,
  pxToMm,
  resizeBox,
  roundBox,
  type Box,
  type ResizeHandle,
} from '../editor/geometry';

const AUTOSAVE_DELAY_MS = 1500;
const HANDLES: ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

interface GestureBase {
  id: string;
  startX: number;
  startY: number;
  box: Box;
  /** Было ли реальное перемещение: от этого зависит и история, и сохранение. */
  moved: boolean;
}
type Gesture =
  | (GestureBase & { kind: 'move' })
  | (GestureBase & { kind: 'resize'; handle: ResizeHandle });

/**
 * Страница редактирования материала.
 *
 * Здесь только лист: холст, блоки, их свойства, вставка переменных
 * и сохранение. Работа со списком и с письмом отсюда уехала целиком —
 * она живёт в рабочем месте материала на «Рассылке».
 *
 * Причина в том, как устроен день: макет рисуют один раз и заранее,
 * а рассылают в день награждения и часто не тот же человек. Пока обе
 * работы жили под одной шапкой, редактор открывался ради списка,
 * и первое, что видел пришедший разослать, — чужой лист, который можно
 * случайно сдвинуть. Обратно, к рассылке, отсюда ведёт одна кнопка,
 * а не встроенная панель.
 */
export function EditorPage() {
  const { id = '' } = useParams();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [saved, setSaved] = useState<'saved' | 'saving' | 'dirty'>('saved');
  /*
   * Что набрано в «О мероприятии» прямо сейчас, до сохранения.
   *
   * Нужно ради живого холста: поле сохраняется по уходу с него, и без
   * черновика название появлялось бы на листе только после клика мимо.
   * Человек при этом смотрит на лист, а не на поле, — и решает, что
   * подстановка опять не работает.
   */
  const [eventDraft, setEventDraft] = useState<EventValues | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const backgroundInput = useRef<HTMLInputElement>(null);

  // Адреса уехавших вкладок: `?view=table` и соседние. Разбираются
  // отдельно, в `moved-views.ts`, — там же объяснено зачем.
  const [params] = useSearchParams();
  const moved = movedViewTarget(params.get('view'), id);

  const doc = useQuery({
    queryKey: ['document', id],
    queryFn: () => api.get<DocumentDetail>(`/documents/${id}`),
  });

  const sheet = doc.data?.sheets[0];
  // Переход к другому материалу: чужой черновик мероприятия на холсте
  // остался бы от прошлого документа.
  useEffect(() => setEventDraft(null), [id]);
  const history = useLayoutHistory([]);
  const { reset, beginGesture, endGesture } = history;

  /*
   * Макет с сервера кладём в историю только при смене листа.
   *
   * Следить за объектом листа целиком нельзя: он пересоздаётся при каждом
   * ответе сервера, а `reset` обнуляет историю. Достаточно было обновить
   * данные — скажем, загрузить бланк, — и все прежние шаги отмены пропадали.
   */
  const sheetId = sheet?.id;
  const loaded = useRef<string | null>(null);
  useEffect(() => {
    if (!sheet || loaded.current === sheet.id) return;
    loaded.current = sheet.id;
    reset(sheet.layout);
  }, [sheet, sheetId, reset]);

  /*
   * Колонки списка и одна его строка.
   *
   * Это не работа со списком, а две вещи, без которых нельзя рисовать
   * лист: имена колонок складываются в подменю переменных при вставке
   * текста, а первая строка служит образцом на холсте — чтобы на месте
   * «%name» стояла живая фамилия, а не токен.
   *
   * Правит же список другая страница, и запрос здесь тот же самый:
   * поправленная там таблица не оставляет холст с данными, которых
   * уже нет.
   */
  const recipients = useRecipients(id);
  const org = useOrgProfile();

  const background = useQuery({
    queryKey: ['file-url', sheet?.backgroundFileId],
    queryFn: () => api.get<{ url: string }>(`/documents/files/${sheet!.backgroundFileId}/url`),
    enabled: Boolean(sheet?.backgroundFileId),
  });

  const save = useMutation({
    mutationFn: (layout: unknown) =>
      api.patch(`/documents/${id}/sheets/${sheet!.id}`, { layout }),
    onSuccess: () => setSaved('saved'),
  });

  const uploadBackground = useMutation({
    mutationFn: (file: File) =>
      api.upload<{ fileId: string; url: string }>(
        `/documents/${id}/sheets/${sheet!.id}/background`,
        file,
      ),
    onSuccess: () => {
      void doc.refetch();
      void background.refetch();
    },
  });

  /** Что предложить, если бланк не тех пропорций, что лист. */
  const [fit, setFit] = useState<PageFit | null>(null);

  const resizePage = useMutation({
    mutationFn: (size: { widthMm: number; heightMm: number }) =>
      api.patch(`/documents/${id}`, {
        pageWidthMm: size.widthMm,
        pageHeightMm: size.heightMm,
      }),
    onSuccess: () => void doc.refetch(),
  });

  /** Собственные настройки материала: мероприятие и проверка по QR. */
  const saveEvent = useMutation({
    mutationFn: (values: Record<string, unknown>) => api.patch(`/documents/${id}`, values),
    onSuccess: () => void doc.refetch(),
  });

  /**
   * Размеры картинки читаем в браузере, до отправки: файл уже здесь,
   * и гонять его на сервер ради двух чисел незачем. Вопрос задаём после
   * успешной загрузки — предлагать подогнать лист под бланк, который
   * не загрузился, бессмысленно.
   */
  async function onPickBackground(file: File) {
    const size = await readImageSize(file).catch(() => null);
    await uploadBackground.mutateAsync(file);
    if (!size || !doc.data) return;

    const result = fitPageToImage(
      { widthMm: doc.data.pageWidthMm, heightMm: doc.data.pageHeightMm },
      size,
    );
    if (result.mismatched) setFit(result);
  }

  // Автосохранение: откладываем запись, пока пользователь продолжает править.
  const { layout, version } = history;
  useEffect(() => {
    if (!sheet || version === 0) return;
    setSaved('dirty');
    const timer = setTimeout(() => {
      setSaved('saving');
      save.mutate(layout);
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
      setZoom(
        fitZoom(el.clientWidth, el.clientHeight, doc.data.pageWidthMm, doc.data.pageHeightMm),
      );
    recompute();
    const observer = new ResizeObserver(recompute);
    observer.observe(el);
    return () => observer.disconnect();
  }, [doc.data]);

  const selected = useMemo(
    () => layout.find((el) => el.id === selectedId) ?? null,
    [layout, selectedId],
  );

  /*
   * Значения для холста: на листе должно стоять название мероприятия,
   * а не «%event». Что именно подставляется и почему — в `preview-data.ts`.
   *
   * Черновик мероприятия сильнее сохранённого: он и есть то, что человек
   * набирает прямо сейчас, глядя на лист.
   */
  const previewData = useMemo(
    () =>
      canvasPreviewData({
        row: recipients.data?.rows[0]?.data,
        orgName: org.data?.orgName,
        event: {
          name: eventDraft?.eventName ?? doc.data?.eventName,
          date: eventDraft?.eventDate ?? doc.data?.eventDate,
          place: eventDraft?.eventPlace ?? doc.data?.eventPlace,
          hours: eventDraft?.eventHours ?? doc.data?.eventHours,
        },
        issuedAt: new Date(),
      }),
    [recipients.data, org.data, doc.data, eventDraft],
  );

  const updateBox = useCallback(
    (id: string, box: Box, commit: boolean) => {
      history.setLayout(
        (prev) => prev.map((el) => (el.id === id ? { ...el, ...roundBox(box) } : el)),
        commit,
      );
    },
    [history],
  );

  // Жест ведём на уровне окна: курсор может выйти за пределы блока и даже листа.
  useEffect(() => {
    if (!doc.data) return;
    const page = doc.data;

    function onMove(e: PointerEvent) {
      const g = gesture.current;
      if (!g) return;
      const dx = pxToMm(e.clientX - g.startX, zoom);
      const dy = pxToMm(e.clientY - g.startY, zoom);

      // Снимок в историю делаем один раз, на первом сдвиге.
      if (!g.moved) {
        g.moved = true;
        beginGesture();
      }

      const next =
        g.kind === 'move'
          ? moveBox(g.box, dx, dy, page.pageWidthMm, page.pageHeightMm)
          : resizeBox(g.box, g.handle, dx, dy, page.pageWidthMm, page.pageHeightMm);
      updateBox(g.id, next, false);
    }

    function onUp() {
      // Без этого перетаскивание не попадало бы в автосохранение:
      // промежуточные кадры намеренно не двигают счётчик версии.
      if (gesture.current?.moved) endGesture();
      gesture.current = null;
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [doc.data, zoom, updateBox, beginGesture, endGesture]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const typing =
        e.target instanceof HTMLElement &&
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName);
      if (typing) return;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) history.redo();
        else history.undo();
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        e.preventDefault();
        history.setLayout((prev) => prev.filter((el) => el.id !== selectedId));
        setSelectedId(null);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [history, selectedId]);

  // Проверка стоит после всех хуков намеренно: ранний выход выше сломал бы
  // их порядок между отрисовками.
  if (moved) return <Navigate to={moved} replace />;

  if (doc.isPending) return <div className="p-6 text-slate-500">Загрузка документа…</div>;
  if (!doc.data || !sheet) return <div className="p-6 text-slate-500">Документ не найден</div>;

  const page = doc.data;

  /**
   * Добавляет элемент в середину листа.
   *
   * Свойства прогоняем через схему, а не задаём вручную: умолчания живут
   * в одном месте, и новый блок гарантированно такой же, каким его увидит
   * печать. Иначе редактор и рендер разошлись бы на первом же новом поле.
   */
  function addElement(
    type: 'text' | 'qr' | 'link',
    size: { w: number; h: number },
    text?: string,
  ) {
    const seed: Record<string, unknown> =
      type === 'text'
        ? { text: text ?? 'Награждается %name' }
        : type === 'link'
          ? { text: 'Проверить подлинность', url: 'https://vruchay.ru' }
          : {};

    const el = {
      id: crypto.randomUUID(),
      type,
      x: page.pageWidthMm / 2 - size.w / 2,
      y: page.pageHeightMm / 2 - size.h / 2,
      w: size.w,
      h: size.h,
      rotation: 0,
      z: layout.length,
      props: sheetLayout.parse([
        { id: 'tmp', type, x: 0, y: 0, w: 1, h: 1, props: seed },
      ])[0].props,
    } as SheetElement;

    history.setLayout((prev) => [...prev, el]);
    setSelectedId(el.id);
  }

  function patchProps(patch: Partial<TextElement['props']>, commit = true) {
    if (!selectedId) return;
    history.setLayout(
      (prev) =>
        prev.map((el) =>
          el.id === selectedId && el.type === 'text'
            ? { ...el, props: { ...el.props, ...patch } }
            : el,
        ) as SheetElement[],
      commit,
    );
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-[var(--line)] bg-[var(--surface)] px-4 py-2.5">
        <Link
          to="/documents"
          className="flex items-center gap-1.5 text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--text)]"
        >
          <ChevronLeft size={16} />
          {/* Именно «Материалы», как называется страница, куда ведёт ссылка.
              Разница со словом «документ» здесь по существу: материал —
              это заготовка, а документы — то, что из неё выпускается
              («создать документы», «осталось 50 документов»). Ссылка,
              обещавшая «Документы», приводила на «Материалы». */}
          Материалы
        </Link>

        <h1 className="font-serif text-lg">{page.title}</h1>

        <InsertMenu
          onInsert={addElement}
          variables={recipients.data?.columns.map((c) => c.name) ?? []}
          onBackground={() => backgroundInput.current?.click()}
          backgroundLoading={uploadBackground.isPending}
          hasBackground={Boolean(sheet.backgroundFileId)}
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

        {uploadBackground.isError && (
          <span role="alert" className="text-sm text-[var(--danger)]">
            {(uploadBackground.error as Error).message}
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          {/* С подписью, а не одними стрелками: две одинаковые серые иконки
              не читаются как «отмена», и человек их просто не находит.
              Заблокированное состояние тоже обязательно — активная кнопка,
              по которой ничего не происходит, выглядит как сломанная. */}
          <Button
            size="sm"
            variant="ghost"
            icon={<Undo2 size={15} />}
            onClick={history.undo}
            disabled={!history.canUndo}
            title="Отменить (Ctrl+Z)"
          >
            Отменить
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon={<Redo2 size={15} />}
            onClick={history.redo}
            disabled={!history.canRedo}
            title="Вернуть (Ctrl+Shift+Z)"
            aria-label="Вернуть"
          />

          <div className="flex items-center gap-2 rounded-lg px-2 py-1 ring-1 ring-[var(--line)]">
            <ZoomIn size={15} className="text-[var(--text-muted)]" />
            <input
              type="range"
              min={20}
              max={200}
              value={Math.round(zoom * 100)}
              onChange={(e) => setZoom(clamp(Number(e.target.value) / 100, 0.1, 4))}
              aria-label="Масштаб"
              className="w-24 accent-[var(--accent)]"
            />
            <span className="tabular w-10 text-right text-sm text-[var(--text-muted)]">
              {Math.round(zoom * 100)}%
            </span>
          </div>

          <StatusChip tone={saved === 'saved' ? 'done' : saved === 'saving' ? 'progress' : 'neutral'}>
            {saved === 'saved' ? (
              <>
                <Check size={13} /> Сохранено
              </>
            ) : saved === 'saving' ? (
              <>
                <LoaderCircle size={13} className="animate-spin" /> Сохраняем
              </>
            ) : (
              <>
                <Dot size={13} /> Есть правки
              </>
            )}
          </StatusChip>

          {/* Выход из редактора в работу со списком — одной кнопкой.
              Раньше на её месте была вкладка, и разница не косметическая:
              вкладка обещает, что список — часть макета, а он часть
              награждения. Правки долетают сами, поэтому уводим без
              вопросов и без «сохранить перед выходом». */}
          <Link to={workspacePath(id)}>
            <Button size="sm" variant="primary" icon={<Send size={15} />}>
              Готово → к рассылке
            </Button>
          </Link>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <div
          ref={containerRef}
          className="relative grid flex-1 place-items-center overflow-auto bg-[var(--surface-sunken)] p-6"
        >
          {/*
            Пустой холст обязан объяснять себя сам.

            Сюда попадают не только из библиотеки: «Загрузить протокол
            соревнований» с рабочего стола заводит материал и открывает
            его же — с чистым листом и без единого следа заготовок,
            потому что галерея заготовок живёт на экране создания
            материала, то есть уже позади. Человек оставался перед пустым
            прямоугольником и уходил.

            Ссылка ведёт назад в библиотеку — туда, где заготовку ещё
            можно выбрать. Настоящая связка «протокол → заготовка» здесь
            не решается: это вопрос устройства потока, и он относится
            к блоку 7. Это заплатка, снимающая тупик, а не готовый поток.

            Подсказка исчезает, как только шаг сделан: постоянная
            подсказка быстро становится мусором на экране.
          */}
          {!sheet.backgroundFileId && layout.length === 0 && (
            <div className="absolute inset-x-0 top-6 z-10 flex justify-center px-6">
              <div className="max-w-sm rounded-2xl bg-[var(--surface)] px-5 py-4 text-center shadow-sm ring-1 ring-[var(--line)]">
                <p className="font-medium">Лист пока пустой</p>
                <p className="mt-1 text-sm text-[var(--text-muted)]">
                  Выберите заготовку, чтобы оформить документ, — текст на ней уже расставлен
                  по листу. Или соберите лист сами: «Вставить» → «Бланк», потом текст.
                </p>
                <Link
                  to="/documents"
                  className="mt-3 inline-block rounded-lg bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-[var(--accent-contrast)] hover:bg-[var(--accent-hover)]"
                >
                  Выбрать заготовку
                </Link>
              </div>
            </div>
          )}
          {sheet.backgroundFileId && layout.length === 0 && (
            <div className="pointer-events-none absolute inset-x-0 top-6 z-10 flex justify-center">
              <p className="rounded-full bg-[var(--surface)] px-4 py-2 text-sm text-[var(--text-muted)] shadow-sm ring-1 ring-[var(--line)]">
                Бланк на месте. Теперь «Вставить» → «Текст» — и выберите, что подставлять.
              </p>
            </div>
          )}
          <div
            className="relative shadow-lg"
            style={{
              width: page.pageWidthMm * PX_PER_MM * zoom,
              height: page.pageHeightMm * PX_PER_MM * zoom,
            }}
          >
            <div style={{ transform: `scale(${zoom})`, transformOrigin: 'top left' }}>
              <SheetRenderer
                layout={layout}
                pageWidthMm={page.pageWidthMm}
                pageHeightMm={page.pageHeightMm}
                backgroundUrl={background.data?.url}
                data={previewData}
                unfilled="token"
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
            </div>

            {/* Слой жестов поверх листа: рамка выделения и ручки размера. */}
            {layout.map((el) => (
              <div
                key={el.id}
                onPointerDown={(e) => {
                  e.preventDefault();
                  setSelectedId(el.id);
                  gesture.current = {
                    kind: 'move',
                    id: el.id,
                    startX: e.clientX,
                    startY: e.clientY,
                    box: { x: el.x, y: el.y, w: el.w, h: el.h },
                    moved: false,
                  };
                }}
                style={{
                  position: 'absolute',
                  left: el.x * PX_PER_MM * zoom,
                  top: el.y * PX_PER_MM * zoom,
                  width: el.w * PX_PER_MM * zoom,
                  height: el.h * PX_PER_MM * zoom,
                  cursor: 'move',
                }}
                className={selectedId === el.id ? 'ring-2 ring-[var(--focus)]' : ''}
              >
                {selectedId === el.id &&
                  HANDLES.map((handle) => (
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
                          moved: false,
                        };
                      }}
                      style={handleStyle(handle)}
                      className="absolute h-2.5 w-2.5 rounded-full border border-[var(--surface)] bg-[var(--focus)]"
                    />
                  ))}
              </div>
            ))}
          </div>
        </div>

        <PropertiesPanel
          element={selected}
          doc={doc.data}
          onSaveEvent={(values) => saveEvent.mutate(values)}
          onEventDraft={setEventDraft}
          onChange={patchProps}
          onDelete={() => {
            if (!selectedId) return;
            history.setLayout((prev) => prev.filter((el) => el.id !== selectedId));
            setSelectedId(null);
          }}
        />
      </div>

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

function handleStyle(handle: ResizeHandle): React.CSSProperties {
  const vertical = handle.includes('n') ? '-5px' : handle.includes('s') ? 'calc(100% - 5px)' : 'calc(50% - 5px)';
  const horizontal = handle.includes('w') ? '-5px' : handle.includes('e') ? 'calc(100% - 5px)' : 'calc(50% - 5px)';
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
