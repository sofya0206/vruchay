import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Check,
  ChevronLeft,
  Dot,
  Image as ImageIcon,
  LoaderCircle,
  Redo2,
  Type,
  Undo2,
  ZoomIn,
} from 'lucide-react';
import { sheetLayout, type SheetElement, type TextElement } from '@gramota/shared';
import { Button } from '../ui/Button';
import { StatusChip } from '../ui/Field';
import { api } from '../api/client';
import type { DocumentDetail } from '../api/types';
import { SheetRenderer } from '../render/SheetRenderer';
import { PropertiesPanel } from '../editor/PropertiesPanel';
import { useLayoutHistory } from '../editor/useLayoutHistory';
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

export function EditorPage() {
  const { id = '' } = useParams();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [saved, setSaved] = useState<'saved' | 'saving' | 'dirty'>('saved');
  const containerRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);

  const doc = useQuery({
    queryKey: ['document', id],
    queryFn: () => api.get<DocumentDetail>(`/documents/${id}`),
  });

  const sheet = doc.data?.sheets[0];
  const history = useLayoutHistory([]);
  const { reset, beginGesture, endGesture } = history;

  useEffect(() => {
    if (sheet) reset(sheet.layout);
  }, [sheet, reset]);

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

  if (doc.isPending) return <div className="p-6 text-slate-500">Загрузка документа…</div>;
  if (!doc.data || !sheet) return <div className="p-6 text-slate-500">Документ не найден</div>;

  const page = doc.data;

  function addTextBlock() {
    const el: TextElement = {
      id: crypto.randomUUID(),
      type: 'text',
      x: page.pageWidthMm / 2 - 60,
      y: page.pageHeightMm / 2 - 10,
      w: 120,
      h: 20,
      rotation: 0,
      z: layout.length,
      props: sheetLayout.parse([
        { id: 'tmp', type: 'text', x: 0, y: 0, w: 1, h: 1, props: { text: 'Награждается %name' } },
      ])[0].props as TextElement['props'],
    };
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
          to="/"
          className="flex items-center gap-1.5 text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--text)]"
        >
          <ChevronLeft size={16} />
          Документы
        </Link>

        <h1 className="font-serif text-lg">{page.title}</h1>

        <div className="mx-2 h-5 w-px bg-[var(--line)]" />

        <Button variant="primary" size="sm" icon={<Type size={15} />} onClick={addTextBlock}>
          Текст
        </Button>

        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-[var(--surface)] px-2.5 py-1.5 text-sm ring-1 ring-[var(--line-strong)] transition-colors hover:bg-[var(--surface-sunken)]">
          <ImageIcon size={15} />
          {uploadBackground.isPending ? 'Загрузка…' : 'Фон'}
          <input
            type="file"
            accept="image/png,image/jpeg"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) uploadBackground.mutate(file);
              e.target.value = '';
            }}
          />
        </label>

        {uploadBackground.isError && (
          <span role="alert" className="text-sm text-[var(--danger)]">
            {(uploadBackground.error as Error).message}
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            icon={<Undo2 size={15} />}
            onClick={history.undo}
            title="Отменить (Ctrl+Z)"
            aria-label="Отменить"
          />
          <Button
            size="sm"
            variant="ghost"
            icon={<Redo2 size={15} />}
            onClick={history.redo}
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
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <div
          ref={containerRef}
          className="grid flex-1 place-items-center overflow-auto bg-[var(--surface-sunken)] p-6"
        >
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
                showRawVariables
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
          onChange={patchProps}
          onDelete={() => {
            if (!selectedId) return;
            history.setLayout((prev) => prev.filter((el) => el.id !== selectedId));
            setSelectedId(null);
          }}
        />
      </div>
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
