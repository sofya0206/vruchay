import { useRef, type ReactNode } from 'react';
import { Download, Mail, ShieldCheck } from 'lucide-react';
import { useRegistryDetail } from '../api/registry';
import { Badge } from '../ui/Badge';
import { Card } from '../ui/Card';
import { Loading } from '../ui/Loading';
import { Sheet } from '../ui/Sheet';
import {
  badgeTone,
  formatDate,
  formatDateTime,
  mailLabel,
  mailTone,
  retentionLabel,
  stateLabel,
  stateTone,
  verifyLabel,
} from './registry-format';

interface Props {
  /** Какой документ открыт; null — шторка закрыта. */
  fileId: string | null;
  onClose: () => void;
}

/**
 * Карточка одного выданного документа: что с ним было и что с ним стало.
 *
 * Шторка сбоку, а не отдельная страница: человек разбирается с одной
 * строкой, не теряя из виду отобранный список, и закрывает её обратно
 * в ту же таблицу.
 */
export function DocumentHistory({ fileId, onClose }: Props) {
  // Пока шторка уезжает, содержимое ещё видно — держим последний открытый документ.
  const last = useRef<string | null>(null);
  if (fileId) last.current = fileId;
  const shownId = fileId ?? last.current;

  const detail = useRegistryDetail(shownId);
  const row = detail.data?.row;

  return (
    <Sheet
      open={fileId !== null}
      onClose={onClose}
      side="right"
      title={row?.name || 'Документ'}
      footer={
        row && (
          <>
            <FileLink href={`/api/registry/files/${row.fileId}/download`}>
              <Download size={16} aria-hidden />
              Скачать
            </FileLink>
            <FileLink href={row.verifyPath}>
              <ShieldCheck size={16} aria-hidden />
              Страница проверки
            </FileLink>
          </>
        )
      }
    >
      {detail.isPending && <Loading label="Открываем карточку" />}
      {detail.isError && (
        <p className="text-sm text-muted">
          Документ не открылся — возможно, материал удалили.
        </p>
      )}

      {row && detail.data && (
        <div className="space-y-5">
          <div>
            <p className="text-sm text-muted">
              {row.documentTitle}
              {row.eventName ? ` · ${row.eventName}` : ''}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge tone={badgeTone(stateTone(row))}>{stateLabel(row)}</Badge>
              <Badge tone={badgeTone(mailTone(row.mail?.status))}>{mailLabel(row.mail?.status)}</Badge>
              {retentionLabel(row.retention) && (
                <Badge tone="danger">{retentionLabel(row.retention)}</Badge>
              )}
            </div>
          </div>

          {row.state === 'revoked' && (
            <Card tone="danger" padding="sm" className="text-sm">
              <p>
                Отозван{row.revokedAt ? ` ${formatDate(row.revokedAt)}` : ''}.
                {row.revokedReasonPublic
                  ? ` Причина для проверяющих: ${row.revokedReasonPublic}.`
                  : ' Причина для проверяющих не указана.'}
              </p>
              {row.revokedReasonInternal && (
                <p className="mt-1 text-muted">Внутренняя причина: {row.revokedReasonInternal}</p>
              )}
            </Card>
          )}

          {row.replacedBy && (
            <Card tone="info" padding="sm" className="text-sm">
              Этот документ заменён на выданный {formatDate(row.replacedBy.issuedAt)}. Страница
              проверки старого показывает предупреждение и ведёт на новый.{' '}
              <a
                className="text-accent hover:underline"
                href={row.replacedBy.verifyPath}
                target="_blank"
                rel="noopener noreferrer"
              >
                Открыть проверку нового
              </a>
            </Card>
          )}

          <dl className="space-y-2 border-y border-line py-4 text-sm">
            <Fact label="Выдан">{formatDateTime(row.issuedAt)}</Fact>
            {row.expiresAt && <Fact label="Действителен до">{formatDate(row.expiresAt)}</Fact>}
            <Fact label="Электронная подпись">
              {row.signedAt ? `Подписан ${formatDate(row.signedAt)}` : 'Без подписи'}
            </Fact>
            {row.printedName && (
              <Fact label="Напечатано">
                {row.printedName}
                <span className="block text-xs text-muted">
                  строка в таблице поправлена после выпуска
                </span>
              </Fact>
            )}
            <Fact label="Адрес почты">{row.email || '—'}</Fact>
            <Fact label="Проверочный код">
              <span className="font-mono text-xs">{row.code}</span>
            </Fact>
            <Fact label="Проверки по QR">
              {verifyLabel(detail.data.verifyCount)}
              {detail.data.verifyLastAt ? `, последняя ${formatDate(detail.data.verifyLastAt)}` : ''}
            </Fact>
            <Fact label="Скачиваний из кабинета">{row.downloadCount}</Fact>
          </dl>

          <section>
            <h3 className="mb-3 text-xs font-medium text-muted">Что происходило</h3>
            <ol className="space-y-3">
              {detail.data.history.map((entry, index) => (
                <li key={`${entry.at}-${index}`} className="flex gap-3">
                  <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-line-strong" />
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-sm">
                      {entry.kind === 'mail' && (
                        <Mail size={16} strokeWidth={1.75} aria-hidden className="shrink-0 text-muted" />
                      )}
                      {entry.title}
                    </p>
                    <p className="text-xs text-muted">
                      {formatDateTime(entry.at)}
                      {entry.actor ? ` · ${entry.actor}` : ''}
                      {entry.detail ? ` · ${entry.detail}` : ''}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>
      )}
    </Sheet>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right tabular">{children}</dd>
    </div>
  );
}

/** Файл отдаёт сервер, поэтому это ссылка в одежде вторичной кнопки. */
function FileLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="pressable inline-flex h-10 items-center gap-2 rounded-control bg-surface px-4 text-sm font-medium text-ink ring-1 ring-line hover:bg-sunken"
    >
      {children}
    </a>
  );
}
