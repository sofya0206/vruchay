import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Code2, Copy, Plus, Trash2 } from 'lucide-react';
import { settingsApi, type Integration } from '../api/settings';
import { ApiError } from '../api/client';
import type { DocumentList } from '../api/types';
import { api } from '../api/client';
import { Button } from '../ui/Button';
import { Input, Label, Select, StatusChip } from '../ui/Field';

/**
 * Формы на сайте.
 *
 * Интеграция открывает выдачу документов посторонним людям, поэтому экран
 * устроен так, чтобы опасные настройки были видны: список разрешённых сайтов,
 * подтверждение адреса и суточный предел стоят на виду, а не в «дополнительно».
 */
export function Integrations() {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [domains, setDomains] = useState('');
  const [documentId, setDocumentId] = useState('');
  const [error, setError] = useState('');

  const list = useQuery({ queryKey: ['integrations'], queryFn: settingsApi.integrations });
  const documents = useQuery({
    queryKey: ['documents', ''],
    queryFn: () => api.get<DocumentList>('/documents?limit=50'),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ['integrations'] });

  const create = useMutation({
    mutationFn: () =>
      settingsApi.createIntegration({
        name: name.trim(),
        allowedDomains: domains
          .split(/[\s,]+/)
          .map((d) => d.trim())
          .filter(Boolean),
        documentIds: [documentId],
      }),
    onSuccess: () => {
      setName('');
      setDomains('');
      setError('');
      void refresh();
    },
    onError: (e: unknown) => setError(e instanceof ApiError ? e.message : 'Не получилось'),
  });

  function onCreate(e: FormEvent) {
    e.preventDefault();
    if (name.trim() && domains.trim() && documentId) create.mutate();
  }

  return (
    <section className="space-y-4">
      <header>
        <h2 className="font-serif text-xl">Формы на сайте</h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Участник заполняет форму на вашей странице — сервис проверяет адрес, создаёт
          документ и отправляет его письмом. Работает с Тильдой и с любой обычной формой.
        </p>
      </header>

      <form onSubmit={onCreate} className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>Название</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Семинар тренеров, октябрь"
          />
        </div>
        <div>
          <Label>Документ</Label>
          <Select value={documentId} onChange={(e) => setDocumentId(e.target.value)}>
            <option value="">Выберите документ</option>
            {documents.data?.items.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title}
              </option>
            ))}
          </Select>
        </div>
        <div className="sm:col-span-2">
          <Label>Сайты, с которых принимаем заявки</Label>
          <Input
            value={domains}
            onChange={(e) => setDomains(e.target.value)}
            placeholder="sca-swimming.com, edu.sca-swimming.com"
          />
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Заявки с других сайтов отклоняются. Поддомены разрешаются вместе с доменом.
          </p>
        </div>
        <div className="sm:col-span-2">
          <Button type="submit" variant="primary" icon={<Plus size={16} />} disabled={create.isPending}>
            Создать интеграцию
          </Button>
        </div>
      </form>
      {error && <p className="text-sm text-[var(--danger)]">{error}</p>}

      <div className="space-y-4">
        {list.data?.map((it) => (
          <IntegrationCard key={it.id} integration={it} onChanged={refresh} />
        ))}
      </div>
    </section>
  );
}

function IntegrationCard({
  integration,
  onChanged,
}: {
  integration: Integration;
  onChanged: () => void;
}) {
  const [showRequests, setShowRequests] = useState(false);

  const remove = useMutation({
    mutationFn: () => settingsApi.deleteIntegration(integration.id),
    onSuccess: onChanged,
  });
  const toggle = useMutation({
    mutationFn: (active: boolean) => settingsApi.updateIntegration(integration.id, { active }),
    onSuccess: onChanged,
  });
  const requests = useQuery({
    queryKey: ['tilda-requests', integration.id],
    queryFn: () => settingsApi.requests(integration.id),
    enabled: showRequests,
  });

  const snippet =
    `<link rel="stylesheet" href="${location.origin}/api/v1/tilda-css/${integration.token}">\n` +
    `<script src="${location.origin}/api/v1/tilda-js/${integration.token}"></script>`;

  return (
    <article className="rounded-xl bg-[var(--surface)] p-4 ring-1 ring-[var(--line)]">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-medium">{integration.name}</span>
        <StatusChip tone={integration.active ? 'done' : 'neutral'}>
          {integration.active ? 'Включена' : 'Выключена'}
        </StatusChip>
        {integration.authMode === 'email_code' && (
          <StatusChip tone="progress">Код на почту</StatusChip>
        )}
        <div className="ml-auto flex gap-2">
          <Button size="sm" onClick={() => toggle.mutate(!integration.active)}>
            {integration.active ? 'Выключить' : 'Включить'}
          </Button>
          <Button
            size="sm"
            variant="danger"
            icon={<Trash2 size={14} />}
            onClick={() => remove.mutate()}
            aria-label={`Удалить интеграцию ${integration.name}`}
          />
        </div>
      </div>

      <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        <Row term="Сайты">{integration.allowedDomains.join(', ')}</Row>
        <Row term="Предел в сутки">{integration.dailyLimit}</Row>
        <Row term="Один документ на адрес">
          {integration.singleFilePerEmail ? 'да' : 'нет'}
        </Row>
        <Row term="Заявок всего">{integration._count?.requests ?? 0}</Row>
      </dl>

      <Snippet code={snippet} />

      <Button
        size="sm"
        variant="ghost"
        className="mt-3"
        onClick={() => setShowRequests((v) => !v)}
      >
        {showRequests ? 'Скрыть заявки' : 'Показать заявки'}
      </Button>

      {showRequests && (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-[var(--text-muted)] uppercase">
              <tr>
                <th className="py-1.5 pr-4 font-medium">Участник</th>
                <th className="py-1.5 pr-4 font-medium">Адрес</th>
                <th className="py-1.5 pr-4 font-medium">Состояние</th>
                <th className="py-1.5 font-medium">Когда</th>
              </tr>
            </thead>
            <tbody>
              {requests.data?.map((r) => (
                <tr key={r.id} className="border-t border-[var(--line)]">
                  <td className="py-1.5 pr-4">{r.fields.name ?? '—'}</td>
                  <td className="py-1.5 pr-4">{r.email}</td>
                  <td className="py-1.5 pr-4">{requestLabel(r.status)}</td>
                  <td className="py-1.5 text-[var(--text-muted)]">
                    {new Date(r.createdAt).toLocaleString('ru-RU')}
                  </td>
                </tr>
              ))}
              {requests.data?.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-3 text-[var(--text-muted)]">
                    Заявок пока нет
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </article>
  );
}

function Row({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="text-[var(--text-muted)]">{term}:</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Snippet({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="mt-3 rounded-lg bg-[var(--surface-sunken)] p-3">
      <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
        <Code2 size={14} />
        Вставьте это в блок HEAD страницы с формой
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto"
          icon={<Copy size={14} />}
          onClick={() => {
            void navigator.clipboard.writeText(code).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
        >
          {copied ? 'Скопировано' : 'Копировать'}
        </Button>
      </div>
      <pre className="mt-2 overflow-x-auto font-mono text-xs">{code}</pre>
      <p className="mt-2 text-xs text-[var(--text-muted)]">
        В форме нужны поля <code className="font-mono">name</code>,{' '}
        <code className="font-mono">email</code>, скрытое{' '}
        <code className="font-mono">doc_id</code> со значением документа и галочка{' '}
        <code className="font-mono">consent</code> — согласие на обработку данных.
      </p>
    </div>
  );
}

function requestLabel(status: string): string {
  const labels: Record<string, string> = {
    pending_otp: 'ждёт код',
    processing: 'готовится',
    done: 'выдан',
    failed: 'ошибка',
    rejected: 'отклонена',
  };
  return labels[status] ?? status;
}
