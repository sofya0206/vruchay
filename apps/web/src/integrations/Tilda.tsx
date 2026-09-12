import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Plus, Trash2 } from 'lucide-react';
import { settingsApi, type Integration } from '../api/settings';
import { ApiError } from '../api/client';
import type { DocumentList } from '../api/types';
import { api } from '../api/client';
import { Button } from '../ui/Button';
import { Input, Label, Select, Toggle } from '../ui/Field';
import { BareInput, Card, FieldCard } from './ui';
import { EmbedCode } from './EmbedCode';
import { TildaGuide } from './TildaGuide';

/**
 * Интеграция с Тильдой.
 *
 * Экран устроен как список настроек сверху вниз: каждая в своей карточке
 * и с подписью, что она делает. Опасные — кому достанется документ и
 * сколько их можно получить за сутки — стоят на виду, а не в «дополнительно»:
 * интеграция открывает выдачу посторонним людям, и владелец должен видеть
 * круг получателей, не открывая ничего лишнего.
 *
 * Правки сохраняются сами: переключатель — сразу, строка ввода — когда
 * из неё уходят. Кнопки «Сохранить» нет намеренно, иначе набранный домен
 * терялся бы при переходе к следующей настройке.
 *
 * Тот же экран целиком стоит блоком «Добавьте на свой сайт» на главной —
 * не копией, а этим самым компонентом: разойдись они, настройка выдачи
 * посторонним людям работала бы на главной иначе, чем в разделе.
 */
export function Tilda({ heading = true }: { heading?: boolean }) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);

  const list = useQuery({ queryKey: ['integrations'], queryFn: settingsApi.integrations });
  const documents = useQuery({
    queryKey: ['documents', ''],
    queryFn: () => api.get<DocumentList>('/documents?limit=50'),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ['integrations'] });

  // Названия документов по идентификатору: в карточке интеграции нужно
  // показать, какой doc_id какому документу соответствует. Один идентификатор
  // без названия человеку ничего не говорит, а вписывать в форму на сайте
  // нужно именно его.
  const titles = new Map(documents.data?.items.map((d) => [d.id, d.title]) ?? []);
  const items = list.data ?? [];

  return (
    <section className="space-y-4">
      {/* Заголовок снимается, когда экран стоит блоком на главной: там
          над ним уже написано, что это за блок, и два заголовка подряд
          читаются как два разных раздела. */}
      {heading && <h2 className="text-lg font-medium">Интеграция с Tilda</h2>}

      {!list.isLoading && items.length === 0 && !adding && (
        <>
          <p className="max-w-3xl text-[var(--text-muted)]">
            Кнопка «Получить документ» на вашей странице: участник проверяет свои
            данные и получает именной документ на почту. Внутри личного кабинета —
            курса, закрытого раздела — имя и почта подставляются сами.
          </p>
          <Button variant="primary" size="lg" onClick={() => setAdding(true)}>
            Создать интеграцию
          </Button>
        </>
      )}

      {items.map((it) => (
        <IntegrationBlock
          key={it.id}
          integration={it}
          documents={documents.data?.items ?? []}
          titles={titles}
          onChanged={refresh}
        />
      ))}

      {adding && (
        <CreateForm
          documents={documents.data?.items ?? []}
          onDone={() => {
            setAdding(false);
            void refresh();
          }}
          onCancel={() => setAdding(false)}
        />
      )}

      {items.length > 0 && !adding && (
        <Button size="lg" icon={<Plus size={18} />} onClick={() => setAdding(true)}>
          Добавить ещё одну интеграцию
        </Button>
      )}
    </section>
  );
}

/** Что нужно знать до создания: как назвать, какой документ и с каких сайтов. */
function CreateForm({
  documents,
  onDone,
  onCancel,
}: {
  documents: { id: string; title: string }[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [domains, setDomains] = useState('');
  const [documentId, setDocumentId] = useState('');
  const [error, setError] = useState('');

  const create = useMutation({
    mutationFn: () =>
      settingsApi.createIntegration({
        name: name.trim(),
        allowedDomains: splitDomains(domains),
        documentIds: [documentId],
      }),
    onSuccess: onDone,
    onError: (e: unknown) => setError(e instanceof ApiError ? e.message : 'Не получилось'),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (name.trim() && domains.trim() && documentId) create.mutate();
  }

  return (
    <Card>
      <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label>Название</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Семинар для наставников, октябрь"
          />
        </div>
        <div>
          <Label>Документ</Label>
          <Select value={documentId} onChange={(e) => setDocumentId(e.target.value)}>
            <option value="">Выберите документ</option>
            {documents.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title}
              </option>
            ))}
          </Select>
        </div>
        <div className="sm:col-span-2">
          <Label>Домены, с которых принимаем заявки</Label>
          <Input
            value={domains}
            onChange={(e) => setDomains(e.target.value)}
            placeholder="sca-swimming.com, edu.sca-swimming.com"
          />
          <p className="mt-1.5 text-sm text-[var(--text-muted)]">
            Заявки с других сайтов отклоняются. Поддомены разрешаются вместе с доменом.
          </p>
        </div>
        <div className="flex gap-2 sm:col-span-2">
          <Button type="submit" variant="primary" size="lg" disabled={create.isPending}>
            Создать интеграцию
          </Button>
          <Button type="button" variant="ghost" size="lg" onClick={onCancel}>
            Отмена
          </Button>
        </div>
        {error && <p className="text-[var(--danger)] sm:col-span-2">{error}</p>}
      </form>
    </Card>
  );
}

/** Настройки одной интеграции — весь экран целиком, сверху вниз. */
function IntegrationBlock({
  integration,
  documents,
  titles,
  onChanged,
}: {
  integration: Integration;
  documents: { id: string; title: string }[];
  titles: Map<string, string>;
  onChanged: () => void;
}) {
  const [showRequests, setShowRequests] = useState(false);

  const save = useMutation({
    mutationFn: (patch: Partial<Integration> | Record<string, unknown>) =>
      settingsApi.updateIntegration(integration.id, patch),
    onSuccess: onChanged,
  });
  const remove = useMutation({
    mutationFn: () => settingsApi.deleteIntegration(integration.id),
    onSuccess: onChanged,
  });
  const requests = useQuery({
    queryKey: ['tilda-requests', integration.id],
    queryFn: () => settingsApi.requests(integration.id),
    enabled: showRequests,
  });

  const busy = save.isPending;

  return (
    <div className="space-y-3">
      <Card>
        <Toggle
          size="lg"
          checked={integration.active}
          disabled={busy}
          onChange={(v) => save.mutate({ active: v })}
          label="Разрешить принимать запросы"
        />
      </Card>

      <FieldCard
        label="Название"
        hint="Внутреннее название интеграции — видно только вам."
      >
        <SavedInput
          value={integration.name}
          disabled={busy}
          onCommit={(v) => v && save.mutate({ name: v })}
        />
      </FieldCard>

      <FieldCard
        label="Домены"
        hint={
          <>
            Домены, на которых размещена форма; несколько — через запятую. Заявки
            с других сайтов отклоняются, поддомены разрешаются вместе с доменом.
            Поддерживается работа <b>только по https</b>.
          </>
        }
      >
        <SavedInput
          value={integration.allowedDomains.join(', ')}
          disabled={busy}
          onCommit={(v) => {
            const list = splitDomains(v);
            if (list.length) save.mutate({ allowedDomains: list });
          }}
        />
      </FieldCard>

      <Card>
        <div className="rounded-lg bg-[var(--surface-sunken)] px-4 py-2.5">
          <span className="block text-sm text-[var(--text-muted)]">Токен</span>
          <code className="font-mono text-lg">{integration.token}</code>
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-3">
          <p className="text-sm text-[var(--text-muted)]">
            Токен, который обязательно должен присутствовать в форме.
          </p>
          <CopyButton value={integration.token} label="Скопировать токен интеграции" />
        </div>
      </Card>

      <FieldCard
        label="Сообщение об успехе"
        hint="Текст сообщения, которое будет выведено участнику после успешного запроса на создание документа."
      >
        <SavedInput
          value={integration.successMessage}
          disabled={busy}
          onCommit={(v) => save.mutate({ successMessage: v })}
        />
      </FieldCard>

      <Card>
        <h3 className="text-lg font-medium">Аутентификация</h3>
        <p className="mt-1.5 max-w-3xl text-sm text-[var(--text-muted)]">
          Форма может быть использована любым посетителем, либо только после
          проверки адреса электронной почты.
        </p>

        <div className="mt-4 space-y-4">
          <Radio
            name={`auth-${integration.id}`}
            checked={integration.authMode === 'none'}
            disabled={busy}
            onSelect={() => save.mutate({ authMode: 'none' })}
            label="Без аутентификации"
            hint="Участник сможет указать любой адрес электронной почты."
          />

          <Radio
            name={`auth-${integration.id}`}
            checked={integration.authMode === 'email_code'}
            disabled={busy}
            onSelect={() => save.mutate({ authMode: 'email_code' })}
            label="По электронной почте"
            hint="После заполнения формы участнику будет отправлен одноразовый код подтверждения на почту. Если проверка не будет пройдена, то документ не будет создан."
          />

          {integration.authMode === 'email_code' && (
            <div className="pl-8">
              <Toggle
                size="lg"
                checked={integration.checkList}
                disabled={busy}
                onChange={(v) => save.mutate({ checkList: v })}
                label="Аутентификация по списку"
                hint="Вначале адрес сверяется с таблицей получателей документа, а затем уже проходит проверка по одноразовому коду. Кого нет в таблице — тому откажем."
              />
            </div>
          )}
        </div>

        <div className="mt-4 border-t border-[var(--line)] pt-4">
          <Toggle
            size="lg"
            checked={integration.singleFilePerEmail}
            disabled={busy}
            onChange={(v) => save.mutate({ singleFilePerEmail: v })}
            label="Разрешить создавать только один документ на каждого человека"
            hint="Повторная заявка отдаст уже выданный документ, а не сделает новый."
          />
        </div>
      </Card>

      <Card>
        <Toggle
          size="lg"
          checked={integration.requireAccount}
          disabled={busy}
          onChange={(v) => save.mutate({ requireAccount: v })}
          label="Принимать запросы только из Личного кабинета"
          hint="Если при запросе будет отсутствовать адрес электронной почты участника из личного кабинета вашего сайта, то запрос будет проигнорирован."
        />
      </Card>

      <Card>
        <Toggle
          size="lg"
          checked={integration.showDownload}
          disabled={busy}
          onChange={(v) => save.mutate({ showDownload: v })}
          label="После отправки формы показывать окно скачивания документа"
          hint="Если эта настройка включена, то участник сможет сам скачать документ."
        />
      </Card>

      <Card>
        <Toggle
          size="lg"
          checked={integration.sendEmail}
          disabled={busy}
          onChange={(v) => save.mutate({ sendEmail: v })}
          label="Отправлять документ участнику письмом"
          hint="Выключите, если документ должен только скачиваться со страницы и письмо не нужно."
        />
      </Card>

      <FieldCard
        label="Отправлять себе копию после создания"
        hint="Созданный документ дополнительно будет отправлен на этот адрес. Оставьте пустым, чтобы копию не отправлять."
      >
        <SavedInput
          value={integration.copyToEmail ?? ''}
          disabled={busy}
          placeholder="adres@example.ru"
          onCommit={(v) => save.mutate({ copyToEmail: v })}
        />
      </FieldCard>

      <FieldCard
        label="Предел заявок в сутки"
        hint="Сколько документов интеграция вправе выдать за сутки. Ограничение защищает от того, чтобы чужой сайт или бот выбрал вашу квоту за ночь."
      >
        <SavedInput
          value={String(integration.dailyLimit)}
          disabled={busy}
          onCommit={(v) => {
            const n = Number(v);
            if (Number.isInteger(n) && n >= 1 && n <= 10_000) save.mutate({ dailyLimit: n });
          }}
        />
      </FieldCard>

      <Card>
        <p className="font-medium">Документы, которые выдаёт эта интеграция</p>
        <ul className="mt-2.5 space-y-2">
          {integration.documentIds.map((id) => (
            <li key={id} className="flex flex-wrap items-center gap-2">
              <span className="text-[var(--text-muted)]">{titles.get(id) ?? 'Документ'}</span>
              <code className="font-mono text-sm">{id}</code>
              <CopyButton value={id} label={`Скопировать код документа ${titles.get(id) ?? ''}`} />
            </li>
          ))}
        </ul>
        <div className="mt-3">
          <Label>Добавить документ</Label>
          <Select
            value=""
            disabled={busy}
            onChange={(e) => {
              const id = e.target.value;
              if (id && !integration.documentIds.includes(id)) {
                save.mutate({ documentIds: [...integration.documentIds, id] });
              }
            }}
          >
            <option value="">Выберите документ</option>
            {documents
              .filter((d) => !integration.documentIds.includes(d.id))
              .map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title}
                </option>
              ))}
          </Select>
        </div>
      </Card>

      <Card>
        <p className="font-medium">Код на страницу с формой</p>
        <EmbedCode
          origin={location.origin}
          token={integration.token}
          documentIds={integration.documentIds}
          titles={titles}
        />
        <p className="mt-2.5 max-w-3xl text-sm text-[var(--text-muted)]">
          Полностью скопируйте код и вставьте на нужные страницы сайта — только
          на те, где есть форма запроса документа, а не на все подряд.
        </p>
        <TildaGuide
          origin={location.origin}
          token={integration.token}
          documentId={integration.documentIds[0] ?? ''}
        />
      </Card>

      <Card>
        <Button variant="ghost" onClick={() => setShowRequests((v) => !v)}>
          {showRequests ? 'Скрыть заявки' : `Показать заявки (${integration._count?.requests ?? 0})`}
        </Button>

        {showRequests && (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-left">
              <thead className="text-sm uppercase text-[var(--text-muted)]">
                <tr>
                  <th className="py-2 pr-4 font-medium">Участник</th>
                  <th className="py-2 pr-4 font-medium">Адрес</th>
                  <th className="py-2 pr-4 font-medium">Состояние</th>
                  <th className="py-2 font-medium">Когда</th>
                </tr>
              </thead>
              <tbody>
                {requests.data?.map((r) => (
                  <tr key={r.id} className="border-t border-[var(--line)]">
                    <td className="py-2 pr-4">{r.fields.name ?? '—'}</td>
                    <td className="py-2 pr-4">{r.email}</td>
                    <td className="py-2 pr-4">{requestLabel(r.status)}</td>
                    <td className="py-2 text-[var(--text-muted)]">
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
      </Card>

      <Card>
        <Button
          variant="danger"
          size="lg"
          icon={<Trash2 size={18} />}
          onClick={() => remove.mutate()}
          aria-label={`Удалить интеграцию ${integration.name}`}
        >
          Удалить эту интеграцию
        </Button>
      </Card>
    </div>
  );
}

/**
 * Строка ввода, которая сохраняется сама.
 *
 * Значение уходит на сервер, когда из поля уходят, и только если оно
 * изменилось: иначе каждое касание поля слало бы запрос. Пока человек
 * набирает, состояние держится здесь — переписывать его ответом сервера
 * посреди набора нельзя, курсор прыгнет.
 */
function SavedInput({
  value,
  disabled,
  placeholder,
  onCommit,
}: {
  value: string;
  disabled?: boolean;
  placeholder?: string;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [editing, setEditing] = useState(false);

  return (
    <BareInput
      value={editing ? draft : value}
      disabled={disabled}
      placeholder={placeholder}
      onFocus={() => {
        setDraft(value);
        setEditing(true);
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        setEditing(false);
        const next = draft.trim();
        if (next !== value.trim()) onCommit(next);
      }}
    />
  );
}

/** Переключатель одного из вариантов: подпись кликабельна вместе с кружком. */
function Radio({
  name,
  checked,
  disabled,
  onSelect,
  label,
  hint,
}: {
  name: string;
  checked: boolean;
  disabled?: boolean;
  onSelect: () => void;
  label: string;
  hint: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input
        type="radio"
        name={name}
        checked={checked}
        disabled={disabled}
        onChange={onSelect}
        className="mt-0.5 size-5 shrink-0 accent-[var(--accent)]"
      />
      <span className="max-w-3xl">
        <span className="block">{label}</span>
        <span className="mt-1 block text-sm text-[var(--text-muted)]">{hint}</span>
      </span>
    </label>
  );
}

/** Кнопка «Копировать» с подтверждением: без отклика непонятно, сработала ли. */
function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <Button
      variant="ghost"
      icon={<Copy size={16} />}
      aria-label={label}
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      {copied ? 'Скопировано' : 'Копировать'}
    </Button>
  );
}

function splitDomains(value: string): string[] {
  return value
    .split(/[\s,]+/)
    .map((d) => d.trim())
    .filter(Boolean);
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
