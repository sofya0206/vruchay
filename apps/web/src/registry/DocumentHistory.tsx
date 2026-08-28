import { Download, Mail, ShieldCheck, X } from 'lucide-react';
import { Button } from '../ui/Button';
import { Loading } from '../ui/Loading';
import { useRegistryDetail } from '../api/registry';
import { StateChip } from './StateChip';
import {
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
  fileId: string;
  onClose: () => void;
}

/**
 * Карточка одного выданного документа: что с ним было и что с ним стало.
 *
 * Панель сбоку, а не отдельная страница: человек разбирается с одной
 * строкой, не теряя из виду отобранный список, и закрывает её обратно
 * в ту же таблицу.
 */
export function DocumentHistory({ fileId, onClose }: Props) {
  const detail = useRegistryDetail(fileId);
  const row = detail.data?.row;

  return (
    <aside
      className="fixed inset-y-0 right-0 z-40 flex w-full max-w-lg flex-col bg-[var(--surface)] shadow-2xl ring-1 ring-[var(--line)]"
      aria-label="Карточка выданного документа"
    >
      <header className="flex items-start gap-3 border-b border-[var(--line)] px-6 py-4">
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-serif text-xl">{row?.name || 'Документ'}</h2>
          <p className="truncate text-sm text-[var(--text-muted)]">
            {row ? `${row.documentTitle}${row.eventName ? ` · ${row.eventName}` : ''}` : ''}
          </p>
        </div>
        <Button size="sm" variant="ghost" icon={<X size={16} />} onClick={onClose}>
          Закрыть
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        {detail.isPending && <Loading label="Открываем карточку" />}
        {detail.isError && (
          <p className="text-sm text-[var(--text-muted)]">
            Этот документ больше не доступен — возможно, материал удалили.
          </p>
        )}

        {row && detail.data && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-2">
              <StateChip tone={stateTone(row)}>{stateLabel(row)}</StateChip>
              <StateChip tone={mailTone(row.mail?.status)}>{mailLabel(row.mail?.status)}</StateChip>
              {retentionLabel(row.retention) && (
                <StateChip tone="bad">{retentionLabel(row.retention)}</StateChip>
              )}
            </div>

            {row.replacedBy && (
              <p className="rounded-xl bg-[var(--award-soft)] p-4 text-sm text-[var(--text)]">
                Этот документ заменён на выданный {formatDate(row.replacedBy.issuedAt)}.
                Страница проверки старого показывает предупреждение и ведёт на новый.{' '}
                <a
                  className="text-[var(--accent)] hover:underline"
                  href={`/verify/${row.replacedBy.publicId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Открыть проверку нового
                </a>
              </p>
            )}

            <dl className="space-y-2 border-y border-[var(--line)] py-4 text-sm">
              <Fact label="Выдан">{formatDateTime(row.issuedAt)}</Fact>
              <Fact label="Адрес почты">{row.email || '—'}</Fact>
              <Fact label="Проверочный код">
                <span className="font-mono text-xs">{row.publicId}</span>
              </Fact>
              <Fact label="Проверки по QR">
                {verifyLabel(detail.data.verifyCount)}
                {detail.data.verifyLastAt
                  ? `, последняя ${formatDate(detail.data.verifyLastAt)}`
                  : ''}
              </Fact>
              <Fact label="Скачиваний из кабинета">{row.downloadCount}</Fact>
            </dl>

            <div className="flex flex-wrap gap-2">
              <a
                href={`/api/registry/files/${row.fileId}/download`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button size="sm" icon={<Download size={14} />}>
                  Скачать
                </Button>
              </a>
              <a href={`/verify/${row.publicId}`} target="_blank" rel="noopener noreferrer">
                <Button size="sm" icon={<ShieldCheck size={14} />}>
                  Страница проверки
                </Button>
              </a>
            </div>

            <section>
              <h3 className="mb-3 text-xs font-medium tracking-wide text-[var(--text-muted)] uppercase">
                Что происходило
              </h3>
              <ol className="space-y-3">
                {detail.data.history.map((entry, index) => (
                  <li key={`${entry.at}-${index}`} className="flex gap-3">
                    <span className="mt-1.5 size-2 shrink-0 rounded-full bg-[var(--line-strong)]" />
                    <div className="min-w-0">
                      <p className="text-sm">
                        {entry.kind === 'mail' && (
                          <Mail size={12} className="mr-1 inline text-[var(--text-muted)]" />
                        )}
                        {entry.title}
                      </p>
                      <p className="text-xs text-[var(--text-muted)]">
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
      </div>
    </aside>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-[var(--text-muted)]">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}
