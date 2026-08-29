import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, RefreshCw, ShieldCheck, ShieldOff } from 'lucide-react';
import { api } from '../api/client';
import { StatusChip } from '../ui/Field';
import { Button } from '../ui/Button';

interface RegistryItem {
  rowId: string;
  name: string;
  email: string;
  fields: Record<string, string>;
  fileId: string;
  publicId: string;
  issuedAt: string;
  revoked: boolean;
  /**
   * Чем документ заменён при перевыпуске. null — не заменялся.
   * Замена не то же самое, что отзыв: у заменённого есть действующий
   * двойник, и его надо показать, а не просто пометить строку.
   */
  replacedBy: { publicId: string; issuedAt: string } | null;
  mailStatus: string | null;
  mailSentAt: string | null;
  mailError: string | null;
}

interface Registry {
  document: { id: string; title: string };
  total: number;
  items: RegistryItem[];
}

/**
 * Состояния письма — по ходу его жизни, от постановки в очередь до прочтения.
 * Порядок задаёт и последовательность фишек в сводке: слева то, что раньше.
 */
const STATUS_LABELS: Record<string, string> = {
  queued: 'в очереди',
  sent: 'отправлено',
  delivered: 'доставлено',
  opened: 'прочитано',
  bounced: 'не доставлено',
  failed: 'ошибка',
};

const STATUS_ORDER = ['queued', 'sent', 'delivered', 'opened', 'bounced', 'failed'];

const BAD = new Set(['bounced', 'failed']);

/**
 * Реестр выданных документов.
 *
 * Федерация обязана уметь ответить, кому и когда выдан наградной документ:
 * он основание для разряда, допуска и отчётности. Без реестра единственным
 * доказательством остаётся письмо в чужом почтовом ящике.
 *
 * Показываем только фактически выданное — строки, у которых есть файл.
 * Отмеченные, но не выпущенные получатели сюда не попадают: реестр отвечает
 * на вопрос «что выдано», а не «что собирались выдать».
 */
export function RegistryTable({ documentId }: { documentId: string }) {
  const qc = useQueryClient();
  const registry = useQuery({
    queryKey: ['registry', documentId],
    queryFn: () => api.get<Registry>(`/documents/${documentId}/registry`),
    // Состояния писем меняются сами: отправку ведёт очередь, а отметки
    // о прочтении приходят часами и днями позже. Реестр, который надо
    // перезагружать вручную, показывал бы вчерашнюю картину.
    refetchInterval: 15_000,
  });

  const setRevoked = useMutation({
    mutationFn: (v: { fileId: string; revoked: boolean }) =>
      api.post(`/documents/${documentId}/registry/${v.fileId}/revoke`, { revoked: v.revoked }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['registry', documentId] }),
  });

  if (registry.isPending) {
    return <p className="p-6 text-[var(--text-muted)]">Загрузка…</p>;
  }

  const items = registry.data?.items ?? [];

  if (items.length === 0) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-dashed border-[var(--line-strong)] px-6 py-16 text-center">
          <ShieldCheck size={28} className="mx-auto mb-3 text-[var(--text-muted)]" strokeWidth={1.5} />
          <p className="font-medium">Пока ничего не выдано</p>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Реестр заполнится сам, когда вы создадите документы получателям
          </p>
        </div>
      </div>
    );
  }

  // Дополнительные колонки документа: у каждой грамоты они свои.
  const extra = [...new Set(items.flatMap((i) => Object.keys(i.fields)))].filter(
    (k) => k !== 'name' && k !== 'email',
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-[var(--line)] px-4 py-3">
        <p className="text-sm">
          Выдано документов: <span className="tabular font-medium">{registry.data?.total}</span>
        </p>

        {/* Сводка по рассылке. Организатору первым делом нужны два числа:
            сколько дошло и сколько не дошло, — а не построчный просмотр
            двухсот участников. */}
        <div className="flex flex-wrap items-center gap-1.5">
          {STATUS_ORDER.map((key) => {
            const count = items.filter((i) => i.mailStatus === key).length;
            if (count === 0) return null;
            return (
              <StatusChip key={key} tone={BAD.has(key) ? 'neutral' : 'done'}>
                {STATUS_LABELS[key]} {count}
              </StatusChip>
            );
          })}
        </div>

        <a
          href={`/api/documents/${documentId}/registry.csv`}
          className="ml-auto inline-flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm ring-1 ring-[var(--line-strong)] transition-colors hover:bg-[var(--surface-sunken)]"
        >
          <Download size={15} />
          Выгрузить для Excel
        </a>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 bg-[var(--surface)]">
            <tr className="border-b border-[var(--line)] text-left">
              <Th className="w-12">№</Th>
              <Th>ФИО</Th>
              <Th>Адрес почты</Th>
              {extra.map((k) => (
                <Th key={k}>{k}</Th>
              ))}
              <Th>Выдан</Th>
              <Th>Письмо</Th>
              <Th>Проверочный код</Th>
              <Th>Подлинность</Th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr
                key={item.rowId}
                className={`border-b border-[var(--line)] ${item.revoked ? 'opacity-55' : ''}`}
              >
                <Td className="tabular text-[var(--text-muted)]">{index + 1}</Td>
                <Td className="font-medium">{item.name || '—'}</Td>
                <Td>{item.email || '—'}</Td>
                {extra.map((k) => (
                  <Td key={k}>{item.fields[k] ?? ''}</Td>
                ))}
                <Td className="tabular whitespace-nowrap">
                  {new Date(item.issuedAt).toLocaleString('ru-RU', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </Td>
                <Td>
                  <MailChip status={item.mailStatus} error={item.mailError} />
                </Td>
                <Td className="font-mono text-xs text-[var(--text-muted)]">{item.publicId}</Td>
                <Td>
                  <RevokeCell
                    item={item}
                    busy={setRevoked.isPending}
                    onChange={(revoked) => setRevoked.mutate({ fileId: item.fileId, revoked })}
                  />
                </Td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Оговорка обязательна. Организатор будет по этой колонке решать,
            кому перевыслать грамоту, и должен понимать: «прочитано» —
            это точно да, а его отсутствие — не «точно нет». */}
        {items.some((i) => i.mailStatus) && (
          <p className="px-3 py-3 text-xs text-[var(--text-muted)]">
            «Прочитано» отмечается, когда почтовая программа участника загружает
            картинку из письма. Часть программ этого не делает, поэтому отметка
            означает «письмо точно открыли», а её отсутствие ещё не значит, что
            не открывали.
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Отзыв подлинности.
 *
 * Нужен, когда документ выдан по ошибке: не тому человеку, с опечаткой
 * в фамилии, по неверному протоколу. Сам файл при этом никуда не девается —
 * его могли уже скачать и распечатать. Меняется ответ страницы проверки:
 * предъявленная бумага перестаёт подтверждаться.
 *
 * Спрашиваем подтверждение: нажатие в строке таблицы слишком легко сделать
 * не на той строке, а последствие — «этот документ недействителен» —
 * увидит посторонний человек с бумагой в руках.
 */
function RevokeCell({
  item,
  busy,
  onChange,
}: {
  item: RegistryItem;
  busy: boolean;
  onChange: (revoked: boolean) => void;
}) {
  const [asking, setAsking] = useState(false);

  /*
   * Замена сильнее отзыва в показе, но не подменяет его: отозванный
   * документ признан недействительным, и об этом надо сказать первым
   * делом. Заменённый — исправленная опечатка, и человеку нужен адрес
   * действующего документа, а не одна пометка «Заменён» без него.
   */
  if (!item.revoked && item.replacedBy) {
    return (
      <div className="flex flex-wrap items-center gap-2 whitespace-nowrap">
        <span className="flex items-center gap-1.5 text-[var(--text-muted)]">
          <RefreshCw size={14} />
          заменён
        </span>
        <a
          href={`/verify/${item.replacedBy.publicId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-[var(--accent)] underline underline-offset-2"
        >
          открыть новый
        </a>
      </div>
    );
  }

  if (item.revoked) {
    return (
      <div className="flex items-center gap-2 whitespace-nowrap">
        <span className="flex items-center gap-1.5 text-[var(--text-muted)]">
          <ShieldOff size={14} />
          отозван
        </span>
        <button
          onClick={() => onChange(false)}
          disabled={busy}
          className="text-sm underline underline-offset-2 hover:text-[var(--text)]"
        >
          вернуть
        </button>
      </div>
    );
  }

  if (asking) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm">Проверка перестанет подтверждать документ.</span>
        <Button
          size="sm"
          variant="danger"
          disabled={busy}
          onClick={() => {
            onChange(true);
            setAsking(false);
          }}
        >
          Отозвать
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setAsking(false)}>
          Отмена
        </Button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setAsking(true)}
      className="text-sm text-[var(--text-muted)] underline underline-offset-2 hover:text-[var(--text)]"
    >
      Отозвать
    </button>
  );
}

function MailChip({ status, error }: { status: string | null; error: string | null }) {
  if (!status) return <span className="text-[var(--text-muted)]">не отправлялось</span>;

  return (
    <span title={error ?? undefined}>
      <StatusChip tone={BAD.has(status) ? 'neutral' : status === 'queued' ? 'progress' : 'done'}>
        {STATUS_LABELS[status] ?? status}
      </StatusChip>
    </span>
  );
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={`px-3 py-2 font-medium text-[var(--text-muted)] ${className}`}>{children}</th>
  );
}

function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-2 ${className}`}>{children}</td>;
}
