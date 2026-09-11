import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, FileText, Send } from 'lucide-react';
import { api } from '../api/client';
import { Button } from '../ui/Button';
import { StatusChip } from '../ui/Field';

/**
 * Счета и заявки.
 *
 * Собственная бухгалтерия владельца сервиса, а не данные организаций-клиентов,
 * — поэтому раздел доступен только владельцу и администратору, а проверка
 * прав стоит на сервере.
 *
 * Кнопка «Оплачено» здесь не про удобство, а про честность: часть переводов
 * автомат не разберёт — назначение платежа без номера счёта, частичная
 * оплата, переплата. Угадывать в таких случаях нельзя, поэтому решает человек.
 */

interface Invoice {
  id: string;
  number: number;
  year: number;
  buyerName: string;
  buyerInn: string;
  email: string;
  tariff: string;
  amountKopecks: number;
  paidAt: string | null;
  sentAt: string | null;
  createdAt: string;
}

interface Lead {
  id: string;
  orgName: string;
  contact: string;
  email: string;
  phone: string | null;
  inn: string | null;
  tariff: string | null;
  volume: string | null;
  comment: string | null;
  status: string;
  createdAt: string;
}

const money = (kopecks: number) =>
  (kopecks / 100).toLocaleString('ru-RU', { minimumFractionDigits: 2 });

const when = (iso: string) => new Date(iso).toLocaleDateString('ru-RU');

export function InvoicesPage() {
  const [tab, setTab] = useState<'invoices' | 'leads' | 'orgs'>('invoices');

  return (
    <div className="min-h-full">
      <main className="mx-auto max-w-5xl px-6 py-8">
        <div role="tablist" className="inline-flex rounded-xl bg-[var(--surface-sunken)] p-1">
          {(
            [
              ['invoices', 'Счета'],
              ['leads', 'Заявки'],
              ['orgs', 'Организации'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              role="tab"
              aria-selected={tab === value}
              onClick={() => setTab(value)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors duration-200 ${
                tab === value
                  ? 'bg-[var(--surface)] text-[var(--text)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text)]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="mt-6">
          {tab === 'invoices' && <Invoices />}
          {tab === 'leads' && <Leads />}
          {tab === 'orgs' && <Organizations />}
        </div>
      </main>
    </div>
  );
}

function Invoices() {
  const qc = useQueryClient();
  const invoices = useQuery({
    queryKey: ['invoices'],
    queryFn: () => api.get<Invoice[]>('/invoices'),
    retry: false,
  });

  const markPaid = useMutation({
    mutationFn: (id: string) => api.post<{ ok: true }>(`/invoices/${id}/paid`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invoices'] }),
  });
  const resend = useMutation({
    mutationFn: (id: string) => api.post<{ ok: true }>(`/invoices/${id}/send`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invoices'] }),
  });

  if (invoices.isPending) return <p className="text-[var(--text-muted)]">Загрузка…</p>;
  // Отказ и пустой список — разные вещи, и раньше оба давали пустую
  // страницу без единого слова: человек не понимал, у него нет счетов
  // или у него нет доступа.
  if (invoices.isError) return <NoAccess />;

  if (invoices.data?.length === 0) {
    return (
      <p className="rounded-xl bg-[var(--surface-sunken)] p-5 text-sm text-[var(--text-muted)]">
        Счетов пока нет. Они выставляются сами, когда организация проходит подбор
        тарифа на сайте и указывает ИНН.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {invoices.data?.map((inv) => (
        <article
          key={inv.id}
          className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-xl bg-[var(--surface)] p-4 ring-1 ring-[var(--line)]"
        >
          <div className="min-w-56 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">№ {inv.number}</span>
              {inv.paidAt ? (
                <StatusChip tone="done">
                  <Check size={13} /> Оплачен {when(inv.paidAt)}
                </StatusChip>
              ) : (
                <StatusChip tone="progress">Ждёт оплаты</StatusChip>
              )}
              {!inv.sentAt && <StatusChip tone="neutral">Не отправлен</StatusChip>}
            </div>
            <p className="mt-1 text-sm">{inv.buyerName}</p>
            <p className="text-xs text-[var(--text-muted)]">
              ИНН {inv.buyerInn} · {inv.email} · от {when(inv.createdAt)}
            </p>
          </div>

          <div className="text-right">
            <p className="text-lg">{money(inv.amountKopecks)} ₽</p>
            <p className="text-xs text-[var(--text-muted)]">{inv.tariff}</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <a href={`/api/invoices/${inv.id}/pdf`} target="_blank" rel="noopener noreferrer">
              <Button size="sm" icon={<FileText size={14} />}>
                Счёт
              </Button>
            </a>
            <Button
              size="sm"
              icon={<Send size={14} />}
              onClick={() => resend.mutate(inv.id)}
              disabled={resend.isPending}
            >
              Отправить
            </Button>
            {!inv.paidAt && (
              <Button
                size="sm"
                variant="primary"
                icon={<Check size={14} />}
                onClick={() => markPaid.mutate(inv.id)}
                disabled={markPaid.isPending}
              >
                Оплачено
              </Button>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}

/** Один и тот же ответ на «сюда нельзя» — во всех трёх вкладках. */
function NoAccess() {
  return (
    <div className="rounded-xl bg-[var(--surface-sunken)] p-5 text-sm text-[var(--text-muted)]">
      <p className="text-[var(--text)]">Этот раздел — для владельца сервиса.</p>
      <p className="mt-1">
        Здесь наша собственная бухгалтерия, а не данные вашей организации. Всё, что нужно вам,
        находится в «Настройках» и в списке материалов.
      </p>
    </div>
  );
}

function Leads() {
  const leads = useQuery({
    queryKey: ['leads'],
    queryFn: () => api.get<Lead[]>('/leads'),
    retry: false,
  });

  if (leads.isPending) return <p className="text-[var(--text-muted)]">Загрузка…</p>;
  if (leads.isError) return <NoAccess />;

  if (leads.data?.length === 0) {
    return (
      <p className="rounded-xl bg-[var(--surface-sunken)] p-5 text-sm text-[var(--text-muted)]">
        Заявок пока нет.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {leads.data?.map((lead) => (
        <article
          key={lead.id}
          className="rounded-xl bg-[var(--surface)] p-4 ring-1 ring-[var(--line)]"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{lead.orgName}</span>
            {lead.tariff && <StatusChip tone="progress">{lead.tariff}</StatusChip>}
            {/* Заявка без ИНН счётом не стала — это видно сразу. */}
            {!lead.inn && <StatusChip tone="neutral">без ИНН, счёт не выставлен</StatusChip>}
            <span className="ml-auto text-xs text-[var(--text-muted)]">{when(lead.createdAt)}</span>
          </div>
          <p className="mt-1 text-sm">
            {lead.contact} · {lead.email}
            {lead.phone ? ` · ${lead.phone}` : ''}
          </p>
          {lead.volume && <p className="text-xs text-[var(--text-muted)]">{lead.volume}</p>}
          {lead.comment && (
            <p className="mt-2 text-sm whitespace-pre-line text-[var(--text-muted)]">
              {lead.comment}
            </p>
          )}
        </article>
      ))}
    </div>
  );
}

interface PlatformOrg {
  id: string;
  name: string;
  plan: 'free' | 'paid';
  createdAt: string;
  ownerEmail: string;
  ownerName: string;
  issued: number;
  /** Что организация назвала о себе — по этому решается вопрос о значке. */
  slug: string | null;
  inn: string;
  verifiedIssuer: boolean;
  publicPageEnabled: boolean;
}

/**
 * Организации-клиенты и их тариф.
 *
 * До этой вкладки перевод с пробы на оплаченный тариф делался правкой
 * в базе: команда, которую страшно выполнять после поступления денег
 * в конце дня, и о которой негде прочитать, кто и когда её выполнял.
 * Теперь это кнопка, и она пишется в журнал.
 *
 * Внутрь организаций отсюда не заглянуть: видно название, тариф и сколько
 * выпущено. Списки участников — дело клиента, и техническая возможность
 * их читать не заводится.
 */
function Organizations() {
  const qc = useQueryClient();
  const orgs = useQuery({
    queryKey: ['platform-orgs'],
    queryFn: () => api.get<PlatformOrg[]>('/platform/organizations'),
    retry: false,
  });

  const setPlan = useMutation({
    mutationFn: (v: { id: string; plan: 'free' | 'paid' }) =>
      api.patch(`/platform/organizations/${v.id}/plan`, { plan: v.plan }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['platform-orgs'] }),
  });

  /*
   * Значок «Верифицированный эмитент» — руками, после того как мы сами
   * проверили домен и ИНН. Автоматической проверки по DNS и ЕГРЮЛ пока
   * нет, поэтому кнопка и пишется в журнал: кто и когда поручился.
   */
  const setVerified = useMutation({
    mutationFn: (v: { id: string; verified: boolean }) =>
      api.patch(`/platform/organizations/${v.id}/verified`, { verified: v.verified }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['platform-orgs'] }),
  });

  if (orgs.isPending) return <p className="text-[var(--text-muted)]">Загрузка…</p>;
  if (orgs.isError) return <NoAccess />;

  const items = orgs.data ?? [];
  if (items.length === 0) return <p className="text-[var(--text-muted)]">Организаций пока нет.</p>;

  return (
    <div className="space-y-2">
      {items.map((org) => (
        <article
          key={org.id}
          className="flex flex-wrap items-center gap-3 rounded-2xl bg-[var(--surface)] p-4 ring-1 ring-[var(--line)]"
        >
          <div className="min-w-52 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-medium">{org.name}</span>
              <StatusChip tone={org.plan === 'paid' ? 'done' : 'neutral'}>
                {org.plan === 'paid' ? 'оплачен' : 'бесплатная проба'}
              </StatusChip>
            </div>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              {org.ownerName ? `${org.ownerName} · ` : ''}
              {org.ownerEmail || 'владелец не найден'} · выпущено {org.issued} · с{' '}
              {when(org.createdAt)}
            </p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              {org.verifiedIssuer ? 'верифицированный эмитент' : 'без значка'}
              {org.inn ? ` · ИНН ${org.inn}` : ' · ИНН не указан'}
              {org.slug
                ? ` · страница ${org.publicPageEnabled ? '' : '(выключена) '}/org/${org.slug}`
                : ' · без публичной страницы'}
            </p>
          </div>

          <Button
            size="sm"
            disabled={setVerified.isPending}
            onClick={() => setVerified.mutate({ id: org.id, verified: !org.verifiedIssuer })}
          >
            {org.verifiedIssuer ? 'Снять значок' : 'Присвоить значок'}
          </Button>

          {org.plan === 'free' ? (
            <Button
              variant="primary"
              size="sm"
              disabled={setPlan.isPending}
              onClick={() => setPlan.mutate({ id: org.id, plan: 'paid' })}
            >
              Перевести на оплаченный
            </Button>
          ) : (
            <Button
              size="sm"
              disabled={setPlan.isPending}
              onClick={() => setPlan.mutate({ id: org.id, plan: 'free' })}
            >
              Вернуть на пробу
            </Button>
          )}
        </article>
      ))}
    </div>
  );
}
