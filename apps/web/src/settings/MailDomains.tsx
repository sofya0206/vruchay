import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Clock, Copy, Plus, RefreshCw, Trash2, TriangleAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
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
          Настраивать не обязательно: письма уже уходят, отправителем в них стоит название
          вашей организации. Свой домен нужен, если хотите, чтобы и адрес был вашим.
          Подтверждается записями в DNS — они появляются в интернете от пятнадцати минут
          до двух суток.
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
        <div className="rounded-xl bg-[var(--surface-sunken)] p-4 text-sm text-[var(--text-muted)]">
          <p>
            Своего домена нет — и это рабочее состояние. Письма уходят с адреса{' '}
            <code className="font-mono">noreply@vruchay.ru</code>, а отправителем участник
            видит название вашей организации. Ответ на письмо придёт вам.
          </p>
          <p className="mt-2">
            Свой домен стоит подключить, когда важно, чтобы адрес отправителя тоже был
            вашим: письма с собственного домена вызывают больше доверия и реже попадают
            в спам.
          </p>
        </div>
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
  const check = useMutation({ mutationFn: () => settingsApi.checkDomain(domain.id), onSuccess: onChanged });
  const remove = useMutation({ mutationFn: () => settingsApi.deleteDomain(domain.id), onSuccess: onChanged });

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
        <p className="mt-3 text-sm text-[var(--text-muted)]">
          {domain.senders.length > 0
            ? `Адресов на этом домене: ${domain.senders.length}. `
            : 'Адресов отправки на нём пока нет. '}
          <Link to="/settings/senders" className="text-[var(--accent)] underline">
            Адреса рассылки
          </Link>
        </p>
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
