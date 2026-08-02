import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Clock, Copy, Plus, RefreshCw, Trash2, TriangleAlert } from 'lucide-react';
import { settingsApi, type MailDomain } from '../api/settings';
import { ApiError } from '../api/client';
import { Button } from '../ui/Button';
import { Input, Label, StatusChip } from '../ui/Field';

/**
 * Подключение домена отправки.
 *
 * Главная задача экрана — провести человека через записи в DNS: это место,
 * где обычно всё и застревает. Поэтому записи показываются целиком, копируются
 * одной кнопкой, а рядом написано, зачем каждая из них нужна.
 */
export function MailDomains() {
  const qc = useQueryClient();
  const [domain, setDomain] = useState('');
  const [error, setError] = useState('');

  const domains = useQuery({ queryKey: ['mail-domains'], queryFn: settingsApi.domains });
  const refresh = () => qc.invalidateQueries({ queryKey: ['mail-domains'] });

  const add = useMutation({
    mutationFn: settingsApi.addDomain,
    onSuccess: () => {
      setDomain('');
      setError('');
      void refresh();
    },
    onError: (e: unknown) => setError(e instanceof ApiError ? e.message : 'Не получилось'),
  });

  function onAdd(e: FormEvent) {
    e.preventDefault();
    if (domain.trim()) add.mutate(domain.trim());
  }

  return (
    <section className="space-y-4">
      <header>
        <h2 className="font-serif text-xl">Домен для отправки</h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Письма уходят с вашего адреса, а не с нашего. Для этого домен нужно подтвердить
          записями в DNS — они появляются в интернете от пятнадцати минут до двух суток.
        </p>
      </header>

      <form onSubmit={onAdd} className="flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1">
          <Label>Домен</Label>
          <Input
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="sca-swimming.com"
            autoComplete="off"
          />
        </div>
        <Button type="submit" variant="primary" icon={<Plus size={16} />} disabled={add.isPending}>
          Добавить
        </Button>
      </form>
      {error && <p className="text-sm text-[var(--danger)]">{error}</p>}

      {domains.data?.length === 0 && (
        <p className="rounded-xl bg-[var(--surface-sunken)] p-4 text-sm text-[var(--text-muted)]">
          Пока ни одного домена. Без подтверждённого домена сервис не отправит ни письма
          с документом, ни кода подтверждения для формы на сайте.
        </p>
      )}

      <div className="space-y-4">
        {domains.data?.map((d) => (
          <DomainCard key={d.id} domain={d} onChanged={refresh} />
        ))}
      </div>
    </section>
  );
}

function DomainCard({ domain, onChanged }: { domain: MailDomain; onChanged: () => void }) {
  const [senderEmail, setSenderEmail] = useState(`info@${domain.domain}`);
  const [senderName, setSenderName] = useState('');
  const [senderError, setSenderError] = useState('');

  const check = useMutation({ mutationFn: () => settingsApi.checkDomain(domain.id), onSuccess: onChanged });
  const remove = useMutation({ mutationFn: () => settingsApi.deleteDomain(domain.id), onSuccess: onChanged });
  const addSender = useMutation({
    mutationFn: () => settingsApi.addSender(domain.id, senderEmail, senderName),
    onSuccess: () => {
      setSenderName('');
      setSenderError('');
      onChanged();
    },
    onError: (e: unknown) => setSenderError(e instanceof ApiError ? e.message : 'Не получилось'),
  });

  const verified = domain.status === 'verified';

  return (
    <article className="rounded-xl bg-[var(--surface)] p-4 ring-1 ring-[var(--line)]">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-medium">{domain.domain}</span>
        {verified ? (
          <StatusChip tone="done">
            <CheckCircle2 size={13} /> Подтверждён
          </StatusChip>
        ) : domain.status === 'failed' ? (
          <StatusChip tone="neutral">
            <TriangleAlert size={13} /> Записи не найдены
          </StatusChip>
        ) : (
          <StatusChip tone="progress">
            <Clock size={13} /> Ждём записи в DNS
          </StatusChip>
        )}
        <div className="ml-auto flex gap-2">
          <Button
            size="sm"
            icon={<RefreshCw size={14} />}
            onClick={() => check.mutate()}
            disabled={check.isPending}
          >
            Проверить
          </Button>
          <Button
            size="sm"
            variant="danger"
            icon={<Trash2 size={14} />}
            onClick={() => remove.mutate()}
            aria-label={`Удалить домен ${domain.domain}`}
          />
        </div>
      </div>

      {!verified && (
        <div className="mt-4 space-y-2">
          <p className="text-sm text-[var(--text-muted)]">
            Добавьте эти записи в панели управления доменом:
          </p>
          {domain.dnsRecords.map((r) => (
            <DnsRow key={`${r.type}-${r.host}`} type={r.type} host={r.host} value={r.value} purpose={r.purpose} />
          ))}
        </div>
      )}

      {verified && (
        <div className="mt-4 space-y-3">
          {domain.senders.length > 0 && (
            <ul className="space-y-1 text-sm">
              {domain.senders.map((s) => (
                <li key={s.id} className="text-[var(--text-muted)]">
                  <span className="text-[var(--text)]">{s.displayName || 'Без подписи'}</span>{' '}
                  &lt;{s.email}&gt;
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-48 flex-1">
              <Label>Адрес отправителя</Label>
              <Input value={senderEmail} onChange={(e) => setSenderEmail(e.target.value)} />
            </div>
            <div className="min-w-48 flex-1">
              <Label>Подпись в письме</Label>
              <Input
                value={senderName}
                onChange={(e) => setSenderName(e.target.value)}
                placeholder="Ассоциация тренеров"
              />
            </div>
            <Button onClick={() => addSender.mutate()} disabled={addSender.isPending}>
              Добавить отправителя
            </Button>
          </div>
          {senderError && <p className="text-sm text-[var(--danger)]">{senderError}</p>}
        </div>
      )}
    </article>
  );
}

function DnsRow({ type, host, value, purpose }: { type: string; host: string; value: string; purpose: string }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="rounded-lg bg-[var(--surface-sunken)] p-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="rounded bg-[var(--surface)] px-1.5 py-0.5 font-mono text-xs ring-1 ring-[var(--line)]">
          {type}
        </span>
        <span className="font-mono text-xs">{host}</span>
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto"
          icon={<Copy size={14} />}
          onClick={copy}
        >
          {copied ? 'Скопировано' : 'Копировать'}
        </Button>
      </div>
      {/* Значение переносим по символам: длинная строка DKIM иначе растянет страницу. */}
      <p className="mt-1.5 font-mono text-xs break-all text-[var(--text)]">{value}</p>
      <p className="mt-1 text-xs text-[var(--text-muted)]">{purpose}</p>
    </div>
  );
}
