import { Check, CheckCheck, Clock, Mail, RefreshCw, X, type LucideIcon } from 'lucide-react';
import { Button } from '../ui/Button';
import { useResendFailed, type LogItem } from './api';
import { STATUS_LABELS, statusTone } from './letter-preview';
import { formatLetterTime, letterList, type MailList } from './mail-lists';
import { errorText } from '../api/client';

/**
 * Список писем открытой папки.
 *
 * Отвечает на единственный вопрос, ради которого сюда заходят: дошло ли
 * письмо и почему не дошло. Причина словами, а не кодом шлюза: «550 5.1.1»
 * не подсказывает, что делать, а «такого адреса не существует» —
 * подсказывает.
 *
 * Отбор по состоянию делают папки слева, поэтому здесь остались только
 * сами письма и повтор недоставленных.
 */
export function MailingLogTable({
  items,
  list,
  documentId,
  undelivered,
  searching,
  truncated,
}: {
  items: LogItem[];
  /** Какая папка открыта — от неё зависит текст на пустом месте. */
  list: MailList;
  /** Выбранный материал: без него повтор недоставленных недоступен. */
  documentId: string;
  undelivered: number;
  /** Стоит ли поиск или отрезок времени — тогда пустота о них, а не о папке. */
  searching: boolean;
  truncated: boolean;
}) {
  const resend = useResendFailed();
  const empty = letterList(list);

  return (
    <div className="space-y-4">
      {/* Повторить можно только по одному материалу: «переотправить всё
          вообще» — это рассылка вслепую по всем прошлым выпускам. */}
      {documentId && undelivered > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-[var(--danger-soft)] px-4 py-3 text-sm">
          <span>
            Не доставлено писем: <b>{undelivered}</b>
          </span>
          <Button
            icon={<RefreshCw size={15} />}
            onClick={() => resend.mutate(documentId)}
            disabled={resend.isPending}
          >
            Отправить повторно
          </Button>
        </div>
      )}

      {resend.isSuccess && (
        <div className="rounded-xl bg-[var(--surface-sunken)] p-4 text-sm">
          <p>Поставлено в очередь заново: {resend.data.queued}</p>
          {resend.data.skipped.length > 0 && (
            <>
              <p className="mt-2 text-[var(--text-muted)]">
                Не повторяли — повтор ничего не изменит, адрес надо исправить в таблице:
              </p>
              <ul className="mt-1 space-y-1">
                {resend.data.skipped.map((item) => (
                  <li key={item.email}>
                    {item.email} — {item.reason}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {resend.isError && (
        <p className="text-sm text-[var(--danger)]">{errorText(resend.error)}</p>
      )}

      {items.length === 0 ? (
        <Empty
          title={searching ? 'Ничего не нашлось' : (empty?.emptyTitle ?? 'Писем нет')}
          hint={
            searching
              ? 'Попробуйте другой запрос или другой отрезок времени.'
              : (empty?.emptyHint ?? '')
          }
        />
      ) : (
        <>
        {/* На телефоне — карточками: таблица в 832 точки уезжала вбок,
            и состояние письма — то, ради чего сюда смотрят, — было за краем. */}
        <ul className="divide-y divide-[var(--line)] overflow-hidden rounded-2xl ring-1 ring-[var(--line)] md:hidden">
          {items.map((item) => (
            <CardRow key={item.id} item={item} />
          ))}
        </ul>
        <div className="overflow-x-auto rounded-2xl ring-1 ring-[var(--line)] max-md:hidden">
          <table className="w-full min-w-[52rem] text-sm">
            <thead className="bg-[var(--surface-sunken)] text-left text-[var(--text-muted)]">
              <tr>
                <th className="px-4 py-2 font-medium">Получатель</th>
                <th className="px-4 py-2 font-medium">Письмо</th>
                <th className="px-4 py-2 font-medium">Материал</th>
                <th className="px-4 py-2 font-medium">Когда</th>
                <th className="px-4 py-2 font-medium">Состояние</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <Row key={item.id} item={item} />
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}

      {truncated && (
        <p className="text-sm text-[var(--text-muted)]">
          {searching
            ? 'Показаны последние 200 найденных писем — уточните поиск.'
            : 'Раздел показывает последние 200 писем. Найдите нужное поиском или выберите материал в нижней строке.'}
        </p>
      )}
    </div>
  );
}

/** Значок состояния: цвет читается быстрее слова, форма — быстрее цвета. */
const STATUS_ICONS: Record<LogItem['status'], LucideIcon> = {
  queued: Clock,
  sent: Check,
  delivered: CheckCheck,
  opened: CheckCheck,
  bounced: X,
  failed: X,
};

const TONE_COLORS = {
  neutral: 'bg-[var(--surface-sunken)] text-[var(--text-muted)]',
  progress: 'bg-[var(--award-soft)] text-[var(--award)]',
  done: 'bg-[var(--ok-soft)] text-[var(--ok)]',
  danger: 'bg-[var(--danger-soft)] text-[var(--danger)]',
} as const;

/** Письмо на телефоне: кому и состояние — первой строкой, тема и время — второй. */
function CardRow({ item }: { item: LogItem }) {
  const Icon = STATUS_ICONS[item.status];
  return (
    <li className="flex flex-col gap-1 px-4 py-3">
      <span className="flex items-center justify-between gap-3">
        <span className="min-w-0 truncate text-[15px] font-medium">{item.toEmail}</span>
        <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${TONE_COLORS[statusTone(item.status)]}`}>
          <Icon size={12} strokeWidth={2} />
          {STATUS_LABELS[item.status]}
        </span>
      </span>
      <span className="truncate text-[13px] text-[var(--text-muted)]">{item.subject}</span>
      <span className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
        <span className="tabular-nums">{formatLetterTime(item.sentAt ?? item.queuedAt)}</span>
        {item.documentTitle && <span className="min-w-0 truncate">· {item.documentTitle}</span>}
      </span>
      {item.problem && <span className="text-[13px] text-[var(--danger)]">{item.problem.reason}</span>}
    </li>
  );
}

function Row({ item }: { item: LogItem }) {
  const tone = statusTone(item.status);
  const colors = {
    neutral: 'bg-[var(--surface-sunken)] text-[var(--text-muted)]',
    progress: 'bg-[var(--award-soft)] text-[var(--award)]',
    done: 'bg-[var(--ok-soft)] text-[var(--ok)]',
    danger: 'bg-[var(--danger-soft)] text-[var(--danger)]',
  } as const;
  const Icon = STATUS_ICONS[item.status];

  return (
    <tr className="border-t border-[var(--line)] align-top transition-colors hover:bg-[var(--surface-sunken)]">
      <td className="px-4 py-2.5">{item.toEmail}</td>
      <td className="px-4 py-2.5">
        <span className="block">{item.subject}</span>
        {item.kind === 'marketing' && (
          <span className="text-xs text-[var(--text-muted)]">реклама</span>
        )}
      </td>
      <td className="px-4 py-2.5 text-[var(--text-muted)]">{item.documentTitle}</td>
      {/* Время отправки, а не постановки в очередь: у ушедшего письма
          спрашивают, когда оно ушло. Пока оно ждёт очереди — когда встало. */}
      <td className="tabular px-4 py-2.5 whitespace-nowrap text-[var(--text-muted)]">
        {formatLetterTime(item.sentAt ?? item.queuedAt)}
      </td>
      <td className="px-4 py-2.5">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${colors[tone]}`}
        >
          <Icon size={13} strokeWidth={2} />
          {STATUS_LABELS[item.status]}
        </span>
        {item.problem && (
          <>
            <p className="mt-1 text-[var(--text)]">{item.problem.reason}</p>
            {item.problem.details && (
              // Ответ шлюза нужен поддержке, а не человеку: под спойлером,
              // чтобы не мешал читать понятную причину.
              <details className="mt-1">
                <summary className="cursor-pointer text-xs text-[var(--text-muted)]">
                  Ответ почтового сервера
                </summary>
                <p className="mt-1 font-mono text-xs break-words text-[var(--text-muted)]">
                  {item.problem.details}
                </p>
              </details>
            )}
          </>
        )}
      </td>
    </tr>
  );
}

/**
 * Пустая папка.
 *
 * Крупный знак и две строки посередине, а не строчка серым в углу: пустой
 * раздел человек видит в первый день работы, и он должен читаться как
 * «сюда придут письма», а не как «что-то сломалось».
 */
function Empty({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="px-6 py-16 text-center">
      <span className="mx-auto mb-5 grid h-28 w-28 place-items-center rounded-full bg-[var(--surface-sunken)]">
        <Mail size={44} strokeWidth={1.25} className="text-[var(--line-strong)]" />
      </span>
      <p className="text-lg font-medium">{title}</p>
      <p className="mx-auto mt-2 max-w-sm text-sm text-[var(--text-muted)]">{hint}</p>
    </div>
  );
}
