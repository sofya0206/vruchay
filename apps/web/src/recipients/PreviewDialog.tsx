import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { api } from '../api/client';
import { mergeVariables } from '@gramota/shared';
import type { DocumentDetail, Sheet } from '../api/types';
import { SheetRenderer } from '../render/SheetRenderer';
import { Button } from '../ui/Button';

interface Row {
  id: string;
  data: Record<string, string>;
}

/**
 * Как будет выглядеть документ конкретного получателя — до выпуска всех.
 *
 * Смысл в цене ошибки: опечатка в макете, найденная после рассылки пятисот
 * грамот, стоит несравнимо дороже, чем взгляд на одну до нажатия кнопки.
 * Поэтому листаем именно настоящих получателей с их данными, а не образец
 * с «Иванов И. И.»: чаще всего вылезает не опечатка, а длинная фамилия,
 * которая не помещается в отведённый блок.
 */
export function PreviewDialog({
  documentId,
  rows,
  onClose,
}: {
  documentId: string;
  rows: Row[];
  onClose: () => void;
}) {
  const [index, setIndex] = useState(0);

  const doc = useQuery({
    queryKey: ['document', documentId],
    queryFn: () => api.get<DocumentDetail>(`/documents/${documentId}`),
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setIndex((i) => Math.min(i + 1, rows.length - 1));
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(i - 1, 0));
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, rows.length]);

  const row = rows[index];
  const sheets = doc.data?.sheets ?? [];

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Предпросмотр документа"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="flex max-h-full w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-[var(--surface)]">
        <header className="flex items-center gap-3 border-b border-[var(--line)] px-4 py-3">
          <div className="min-w-0">
            <p className="truncate font-medium">{row?.data.name || 'Без имени'}</p>
            <p className="tabular text-sm text-[var(--text-muted)]">
              {index + 1} из {rows.length}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              icon={<ChevronLeft size={16} />}
              disabled={index === 0}
              onClick={() => setIndex((i) => i - 1)}
              aria-label="Предыдущий получатель"
            />
            <Button
              size="sm"
              variant="ghost"
              icon={<ChevronRight size={16} />}
              disabled={index >= rows.length - 1}
              onClick={() => setIndex((i) => i + 1)}
              aria-label="Следующий получатель"
            />
            <Button size="sm" variant="ghost" icon={<X size={16} />} onClick={onClose} aria-label="Закрыть" />
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-auto bg-[var(--surface-sunken)] p-6">
          {doc.isPending && <p className="text-center text-[var(--text-muted)]">Загрузка…</p>}
          <div className="space-y-6">
            {sheets.map((sheet) => (
              <Scaled
                key={sheet.id}
                widthMm={doc.data!.pageWidthMm}
                heightMm={doc.data!.pageHeightMm}
              >
                <SheetPreview
                  sheet={sheet}
                  widthMm={doc.data!.pageWidthMm}
                  heightMm={doc.data!.pageHeightMm}
                  /* Служебные переменные подставляем и здесь: иначе
                     в предпросмотре на месте даты и номера пустота,
                     и человек решает, что переменная не работает. */
                  data={mergeVariables(row?.data ?? {}, {
                    issuedAt: new Date(),
                    number: index + 1,
                    // Проверочный код выделяется в момент печати, до неё
                    // его нет. Показываем словами, а не пустотой.
                    publicId: 'код появится при выпуске',
                    event: {
                      name: doc.data?.eventName,
                      date: doc.data?.eventDate,
                      place: doc.data?.eventPlace,
                      hours: doc.data?.eventHours,
                    },
                  })}
                />
              </Scaled>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Один лист с подгруженным фоном.
 *
 * Ссылку на фон запрашиваем здесь, а не в родителе: она подписанная
 * и живёт недолго, а листов в документе может быть несколько.
 */
function SheetPreview({
  sheet,
  widthMm,
  heightMm,
  data,
}: {
  sheet: Sheet;
  widthMm: number;
  heightMm: number;
  data: Record<string, string>;
}) {
  const background = useQuery({
    queryKey: ['file-url', sheet.backgroundFileId],
    queryFn: () => api.get<{ url: string }>(`/documents/files/${sheet.backgroundFileId}/url`),
    enabled: Boolean(sheet.backgroundFileId),
  });

  return (
    <SheetRenderer
      layout={sheet.layout}
      pageWidthMm={widthMm}
      pageHeightMm={heightMm}
      backgroundUrl={background.data?.url}
      data={data}
    />
  );
}

/** Вписывает лист в натуральную величину в доступную ширину. */
function Scaled({
  widthMm,
  heightMm,
  children,
}: {
  widthMm: number;
  heightMm: number;
  children: React.ReactNode;
}) {
  const [scale, setScale] = useState(0);
  const [box, setBox] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!box) return;
    const probe = document.createElement('div');
    probe.style.cssText = `position:absolute;visibility:hidden;width:${widthMm}mm`;
    box.appendChild(probe);
    const sheetPx = probe.getBoundingClientRect().width;
    probe.remove();

    const update = () => {
      const w = box.getBoundingClientRect().width;
      // Не увеличиваем сверх натуральной величины: растянутый лист выглядит
      // мылом и вводит в заблуждение насчёт качества печати.
      if (w > 0 && sheetPx > 0) setScale(Math.min(1, w / sheetPx));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(box);
    return () => observer.disconnect();
  }, [box, widthMm]);

  return (
    <div ref={setBox} className="mx-auto w-full">
      {scale > 0 && (
        <div
          className="mx-auto overflow-hidden shadow-lg"
          style={{ width: `${widthMm * scale}mm`, height: `${heightMm * scale}mm` }}
        >
          <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}>{children}</div>
        </div>
      )}
    </div>
  );
}
