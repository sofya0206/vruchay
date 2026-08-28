import { useEffect, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BadgeCheck, ChevronLeft, ChevronRight } from 'lucide-react';
import { mergeVariables } from '@gramota/shared';
import { api } from '../api/client';
import { useOrgProfile } from '../api/org';
import type { DocumentDetail, Sheet } from '../api/types';
import type { RecipientTable } from '../api/recipients';
import { SheetRenderer } from '../render/SheetRenderer';
import { parseBody, type Run } from '../mail/email-body';
import { Button } from '../ui/Button';
import { Dialog } from './Dialog';
import { fillVariables, previewValues } from './letter-preview';
import type { LetterKind } from './api';

type Tab = 'document' | 'letter' | 'verify';

const TABS: { id: Tab; label: string }[] = [
  { id: 'document', label: 'Документ' },
  { id: 'letter', label: 'Письмо' },
  { id: 'verify', label: 'Страница получателя' },
];

/**
 * Тройная проверка перед рассылкой: документ, письмо и страница проверки.
 *
 * Все три вещи участник видит подряд — сначала письмо, потом вложение,
 * потом страницу по QR-коду, — и ошибка в любой из них выглядит одинаково
 * плохо. Смотреть их по отдельности в трёх местах кабинета значит смотреть
 * их через раз.
 *
 * Листаем настоящих получателей, а не образец: типовая находка — не опечатка,
 * а длинная фамилия, которая не помещается в отведённый блок, и пустая
 * колонка, о которой никто не знал.
 */
export function TriplePreview({
  documentId,
  kind,
  subject,
  body,
  advertiserName,
  onClose,
}: {
  documentId: string;
  kind: LetterKind;
  subject: string;
  body: string;
  advertiserName: string;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>('document');
  const [index, setIndex] = useState(0);

  const doc = useQuery({
    queryKey: ['document', documentId],
    queryFn: () => api.get<DocumentDetail>(`/documents/${documentId}`),
  });

  const recipients = useQuery({
    queryKey: ['recipients', documentId],
    queryFn: () => api.get<RecipientTable>(`/documents/${documentId}/recipients`),
  });

  // Больше полусотни листать никто не станет, а тянуть в память всю
  // таблицу на десять тысяч строк ради предпросмотра незачем.
  const rows = (recipients.data?.rows ?? []).slice(0, 50);
  const row = rows[index];
  const columns = recipients.data?.columns.map((c) => c.name) ?? [];
  const values = previewValues(row?.data, columns);
  const orgName = useOrgProfile().data?.orgName;

  useEffect(() => {
    if (index >= rows.length) setIndex(0);
  }, [index, rows.length]);

  return (
    <Dialog
      title="Проверка перед отправкой"
      onClose={onClose}
      wide
      footer={
        <>
          <div className="flex items-center gap-1">
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
          </div>
          <p className="text-sm text-[var(--text-muted)]">
            {rows.length === 0
              ? 'В таблице получателей пока никого'
              : `${row?.data.name || 'Без имени'} — ${index + 1} из ${rows.length}`}
          </p>
        </>
      }
    >
      <div className="mb-4 flex gap-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            aria-current={tab === t.id}
            className={`rounded-lg px-3 py-1.5 text-sm ${
              tab === t.id
                ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
                : 'text-[var(--text-muted)] hover:bg-[var(--surface-sunken)]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'document' && (
        <DocumentPreview doc={doc.data} data={values} position={index + 1} orgName={orgName} />
      )}

      {tab === 'letter' && (
        <LetterPreview
          subject={fillVariables(subject, values)}
          body={fillVariables(body, values)}
          kind={kind}
          advertiserName={advertiserName}
        />
      )}

      {tab === 'verify' && <VerifyPreview doc={doc.data} data={values} />}
    </Dialog>
  );
}

/** Лист документа с данными выбранного получателя. */
function DocumentPreview({
  doc,
  data,
  position,
  orgName,
}: {
  doc: DocumentDetail | undefined;
  data: Record<string, string>;
  position: number;
  orgName?: string;
}) {
  if (!doc) return <p className="text-center text-[var(--text-muted)]">Загрузка…</p>;

  const merged = mergeVariables(data, {
    issuedAt: new Date(),
    number: position,
    // Проверочный код выделяется в момент выпуска — до него его нет.
    publicId: 'код появится при выпуске',
    orgName,
    event: {
      name: doc.eventName,
      date: doc.eventDate,
      place: doc.eventPlace,
      hours: doc.eventHours,
    },
  });

  return (
    <div className="space-y-6 rounded-xl bg-[var(--surface-sunken)] p-4">
      {doc.sheets.map((sheet) => (
        <Scaled key={sheet.id} widthMm={doc.pageWidthMm} heightMm={doc.pageHeightMm}>
          <SheetPage
            sheet={sheet}
            widthMm={doc.pageWidthMm}
            heightMm={doc.pageHeightMm}
            data={merged}
          />
        </Scaled>
      ))}
    </div>
  );
}

function SheetPage({
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

/** Вписывает лист натуральной величины в доступную ширину. */
function Scaled({
  widthMm,
  heightMm,
  children,
}: {
  widthMm: number;
  heightMm: number;
  children: ReactNode;
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
      // Не увеличиваем сверх натуральной величины: растянутый лист
      // выглядит мылом и врёт о качестве печати.
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

/**
 * Письмо так, как его увидит участник.
 *
 * Разметку в страницу кабинета не вставляем: текст письма набирает
 * сотрудник, а смотрит его владелец, и вставка означала бы выполнение
 * чужого кода в чужой сессии. Рисуем разбором — тем же, что уходит
 * на сервер, поэтому предпросмотр и письмо не разъезжаются.
 */
function LetterPreview({
  subject,
  body,
  kind,
  advertiserName,
}: {
  subject: string;
  body: string;
  kind: LetterKind;
  advertiserName: string;
}) {
  const paragraphs = parseBody(body);

  return (
    <div className="rounded-xl bg-[var(--surface-sunken)] p-4">
      <p className="text-xs text-[var(--text-muted)]">Тема</p>
      <p className="mt-1 font-medium">{subject || '(без темы)'}</p>

      {/* Белый фон и тёмный текст независимо от темы кабинета: письмо
          человек откроет в почте, а не здесь. */}
      <div className="mt-3 rounded-lg bg-white px-4 py-3 text-[15px] leading-relaxed text-[#1a1a1a]">
        {paragraphs.length === 0 ? (
          <p className="text-sm text-neutral-400">Письмо пустое</p>
        ) : (
          paragraphs.map((runs, i) => (
            <p key={i} className={i > 0 ? 'mt-3' : undefined}>
              {runs.map((run, j) => (
                <RunView key={j} run={run} />
              ))}
            </p>
          ))
        )}

        {/* Низ рекламного письма собирает сервер, но показать его надо
            здесь: человек должен видеть, что отправляет именно рекламу. */}
        {kind === 'marketing' && (
          <div className="mt-6 border-t border-neutral-200 pt-3 text-xs text-neutral-500">
            <p>Реклама. {advertiserName || '(рекламодатель не указан)'}</p>
            <p className="mt-1 underline">Отписаться от рассылки</p>
          </div>
        )}
      </div>
    </div>
  );
}

function RunView({ run }: { run: Run }) {
  switch (run.kind) {
    case 'break':
      return <br />;
    case 'bold':
      return <b>{run.text}</b>;
    case 'italic':
      return <i>{run.text}</i>;
    case 'link':
      // Рабочей ссылку не делаем: уводить человека со страницы проверки
      // рассылки — последнее, что здесь нужно.
      return <span className="text-[#1F5D3F] underline">{run.text}</span>;
    default:
      return <>{run.text}</>;
  }
}

/**
 * Страница, которую увидит тот, кто просканирует QR-код с документа.
 *
 * Показываем ровно те поля, которые организация сама отметила
 * показываемыми: остальное на этой странице не появляется, иначе перебор
 * ссылок стал бы выгрузкой списка участников.
 */
function VerifyPreview({
  doc,
  data,
}: {
  doc: DocumentDetail | undefined;
  data: Record<string, string>;
}) {
  if (!doc) return <p className="text-center text-[var(--text-muted)]">Загрузка…</p>;

  if (!doc.verifyEnabled) {
    return (
      <div className="rounded-xl bg-[var(--surface-sunken)] p-6 text-center text-sm text-[var(--text-muted)]">
        Проверка подлинности для этого материала выключена — страницы по QR-коду не будет.
      </div>
    );
  }

  const fields = doc.verifyFields.filter((key) => data[key]);

  return (
    <div className="rounded-xl bg-[var(--surface-sunken)] p-6">
      <div className="mx-auto max-w-md rounded-2xl bg-[var(--surface)] p-8 text-center ring-1 ring-[var(--line)]">
        <BadgeCheck size={40} className="mx-auto text-[var(--accent)]" strokeWidth={1.5} />
        <p className="mt-4 font-serif text-2xl">Документ подлинный</p>
        <p className="mt-1 text-[var(--text-muted)]">{doc.title}</p>

        <dl className="mt-6 space-y-2 border-t border-[var(--line)] pt-6 text-left text-sm">
          {fields.length === 0 && (
            <p className="text-center text-[var(--text-muted)]">
              Поля не выбраны — страница подтвердит только подлинность
            </p>
          )}
          {fields.map((key) => (
            <div key={key} className="flex justify-between gap-4">
              <dt className="text-[var(--text-muted)]">{key}</dt>
              <dd className="text-right font-medium">{data[key]}</dd>
            </div>
          ))}
          <div className="flex justify-between gap-4">
            <dt className="text-[var(--text-muted)]">Выдан</dt>
            <dd className="tabular text-right font-medium">
              {new Date().toLocaleDateString('ru-RU', {
                day: '2-digit',
                month: 'long',
                year: 'numeric',
              })}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
