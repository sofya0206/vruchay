import { Check, CheckCheck, Clock, Mail, RefreshCw, X, type LucideIcon } from 'lucide-react';
import { Badge, type BadgeTone } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { NextAction } from '../ui/NextAction';
import { TBody, THead, Table, Td, Th, Tr } from '../ui/Table';
import { toast } from '../ui/Toast';
import { useResendFailed, type LogItem } from './api';
import { STATUS_LABELS, statusTone } from './letter-preview';
import { formatLetterTime, letterList, type MailList } from './mail-lists';
import { errorText } from '../api/client';

/**
 * Журнал писем.
 *
 * Отвечает на единственный вопрос, ради которого сюда заходят: дошло ли
 * письмо и почему не дошло. Причина словами, а не кодом шлюза: «550 5.1.1»
 * не подсказывает, что делать, а «такого адреса не существует» —
 * подсказывает. На телефоне — карточками: таблица уезжала вбок, и
 * состояние письма было за краем.
 */
export function MailingLogTable({
  items,
  status,
  documentId,
  undelivered,
  searching,
  truncated,
}: {
  items: LogItem[];
  /** Какое состояние отобрано — от него зависит текст на пустом месте. */
  status: MailList;
  /** Выбранный документ: без него повтор недоставленных недоступен. */
  documentId: string;
  undelivered: number;
  /** Стоит ли поиск или отрезок времени — тогда пустота о них, а не о папке. */
  searching: boolean;
  truncated: boolean;
}) {
  const resend = useResendFailed();
  const empty = letterList(status);

  async function resendAll() {
    try {
      const result = await resend.mutateAsync(documentId);
      toast({
        title: `Поставлено в очередь заново: ${result.queued}`,
        description:
          result.skipped.length > 0
            ? `Не повторяли ${result.skipped.length}: адрес надо исправить в таблице`
            : undefined,
        tone: 'ok',
      });
    } catch (err) {
      toast({ title: 'Повторить не удалось', description: errorText(err), tone: 'danger' });
    }
  }

  return (
    <div className="space-y-4">
      {/* Повторить можно только по одному документу: «переотправить всё
          вообще» — это рассылка вслепую по всем прошлым выпускам. */}
      {documentId && undelivered > 0 && (
        <Card tone="info" padding="sm" className="flex flex-wrap items-center gap-3 text-sm">
          <span className="flex-1">
            Не доставлено писем: <b className="tabular">{undelivered}</b>
          </span>
          <Button size="sm" icon={<RefreshCw size={16} />} loading={resend.isPending} onClick={() => void resendAll()}>
            Отправить повторно
          </Button>
        </Card>
      )}

      {resend.isSuccess && resend.data.skipped.length > 0 && (
        <Card padding="sm" className="text-sm">
          <p className="text-muted">Не повторяли — повтор ничего не изменит, адрес надо исправить в таблице:</p>
          <ul className="mt-1 space-y-1">
            {resend.data.skipped.map((item) => (
              <li key={item.email}>
                {item.email} — {item.reason}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {items.length === 0 ? (
        <Card padding="none">
          {searching ? (
            <NextAction
              compact
              icon={Mail}
              title="Ничего не нашлось"
              text="Попробуйте другой запрос или другой отрезок времени."
            />
          ) : status === 'all' ? (
            <NextAction
              icon={Mail}
              title="Разошлите первые документы"
              text="Письма участникам уходят с шага «Выпуск» у документа. Их доставка появится здесь."
              primary={{ label: 'К документам', to: '/documents' }}
            />
          ) : (
            <NextAction compact icon={Mail} title={empty?.emptyTitle ?? 'Писем нет'} text={empty?.emptyHint} />
          )}
        </Card>
      ) : (
        <Card padding="none" className="overflow-hidden">
          <Table
            caption="Письма"
            cards={
              <ul className="divide-y divide-line">
                {items.map((item) => (
                  <CardRow key={item.id} item={item} />
                ))}
              </ul>
            }
          >
            <THead>
              <Tr>
                <Th>Получатель</Th>
                <Th>Письмо</Th>
                <Th>Документ</Th>
                <Th>Когда</Th>
                <Th>Состояние</Th>
              </Tr>
            </THead>
            <TBody>
              {items.map((item) => (
                <Row key={item.id} item={item} />
              ))}
            </TBody>
          </Table>
        </Card>
      )}

      {truncated && (
        <p className="text-sm text-muted">
          {searching
            ? 'Показаны последние 200 найденных писем — уточните поиск.'
            : 'Показаны последние 200 писем. Найдите нужное поиском или выберите документ.'}
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

const TONES: Record<ReturnType<typeof statusTone>, BadgeTone> = {
  neutral: 'neutral',
  progress: 'info',
  done: 'ok',
  danger: 'danger',
};

function StatusBadge({ item }: { item: LogItem }) {
  const Icon = STATUS_ICONS[item.status];
  return (
    <Badge tone={TONES[statusTone(item.status)]}>
      <Icon size={12} strokeWidth={2.5} aria-hidden />
      {STATUS_LABELS[item.status]}
    </Badge>
  );
}

/** Письмо на телефоне: кому и состояние — первой строкой, тема и время — второй. */
function CardRow({ item }: { item: LogItem }) {
  return (
    <li className="flex flex-col gap-1 px-4 py-3">
      <span className="flex items-center justify-between gap-3">
        <span className="min-w-0 truncate text-base font-medium">{item.toEmail}</span>
        <StatusBadge item={item} />
      </span>
      <span className="truncate text-sm text-muted">{item.subject}</span>
      <span className="flex items-center gap-2 text-xs text-muted">
        <span className="tabular">{formatLetterTime(item.sentAt ?? item.queuedAt)}</span>
        {item.documentTitle && <span className="min-w-0 truncate">· {item.documentTitle}</span>}
      </span>
      {item.problem && <span className="text-sm text-danger">{item.problem.reason}</span>}
    </li>
  );
}

function Row({ item }: { item: LogItem }) {
  return (
    <Tr className="align-top">
      <Td className="h-auto py-2.5">{item.toEmail}</Td>
      <Td className="h-auto py-2.5">
        <span className="block">{item.subject}</span>
        {item.kind === 'marketing' && <span className="text-xs text-muted">реклама</span>}
      </Td>
      <Td className="h-auto py-2.5 text-muted">{item.documentTitle}</Td>
      {/* Время отправки, а не постановки в очередь: у ушедшего письма
          спрашивают, когда оно ушло. Пока оно ждёт очереди — когда встало. */}
      <Td numeric className="h-auto py-2.5 whitespace-nowrap text-muted">
        {formatLetterTime(item.sentAt ?? item.queuedAt)}
      </Td>
      <Td className="h-auto py-2.5">
        <StatusBadge item={item} />
        {item.problem && (
          <>
            <p className="mt-1 text-ink">{item.problem.reason}</p>
            {item.problem.details && (
              // Ответ шлюза нужен поддержке, а не человеку: под спойлером.
              <details className="mt-1">
                <summary className="cursor-pointer text-xs text-muted">Ответ почтового сервера</summary>
                <p className="mt-1 font-mono text-xs break-words text-muted">{item.problem.details}</p>
              </details>
            )}
          </>
        )}
      </Td>
    </Tr>
  );
}
