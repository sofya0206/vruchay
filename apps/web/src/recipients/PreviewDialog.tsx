import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '../api/client';
import { useOrgProfile } from '../api/org';
import { mergeVariables } from '@gramota/shared';
import type { DocumentDetail, Sheet } from '../api/types';
import { SheetRenderer } from '../render/SheetRenderer';
import { Dialog } from '../ui/Dialog';
import { IconButton } from '../ui/IconButton';
import { ICON, STROKE } from '../ui/icon';

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
  const org = useOrgProfile();

  // Стрелками листаем получателей; Esc — за окном.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setIndex((i) => Math.min(i + 1, rows.length - 1));
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(i - 1, 0));
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [rows.length]);

  const row = rows[index];
  const sheets = doc.data?.sheets ?? [];

  return (
    <Dialog
      size="lg"
      title="Будущий документ"
      description={
        <>
          {row?.data.name || 'Без имени'} ·{' '}
          <span className="tabular">
            {index + 1} из {rows.length}
          </span>
        </>
      }
      onClose={onClose}
      footer={
        <>
          <IconButton
            size="sm"
            variant="secondary"
            label="Предыдущий получатель"
            disabled={index === 0}
            onClick={() => setIndex((i) => i - 1)}
          >
            <ChevronLeft size={ICON.sm} strokeWidth={STROKE} />
          </IconButton>
          <IconButton
            size="sm"
            variant="secondary"
            label="Следующий получатель"
            disabled={index >= rows.length - 1}
            onClick={() => setIndex((i) => i + 1)}
          >
            <ChevronRight size={ICON.sm} strokeWidth={STROKE} />
          </IconButton>
        </>
      }
    >
      <div className="rounded-card bg-sunken p-4">
        {doc.isPending && <p className="text-center text-sm text-muted">Загружаем документ</p>}
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
                  orgName: org.data?.orgName,
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
    </Dialog>
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
          <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}>
            {children}
          </div>
        </div>
      )}
    </div>
  );
}
