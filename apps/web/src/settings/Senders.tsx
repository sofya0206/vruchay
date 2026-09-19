import { FormEvent, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Send, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { settingsApi, type Sender } from '../api/settings';
import { ApiError } from '../api/client';
import { Button } from '../ui/Button';
import { SectionHead } from '../ui/Settings';
import { Input, Label, Textarea } from '../ui/Field';
import { Select } from '../ui/Select';

/**
 * Адреса, с которых уходят письма участникам.
 *
 * Раньше форма добавления пряталась внутри карточки домена, и найти её
 * можно было, только развернув подтверждённый домен. Здесь адреса собраны
 * в один список по всем доменам — так видно, чем организация подписывается
 * на самом деле.
 */
export function Senders() {
  const qc = useQueryClient();
  const domains = useQuery({ queryKey: ['mail-domains'], queryFn: settingsApi.domains });
  const refresh = () => qc.invalidateQueries({ queryKey: ['mail-domains'] });

  const verified = (domains.data ?? []).filter((d) => d.status === 'verified');
  const senders = verified.flatMap((d) => d.senders.map((s) => ({ ...s, domain: d.domain })));

  const [domainId, setDomainId] = useState('');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');

  // Домен по умолчанию — первый подтверждённый: у большинства он единственный.
  useEffect(() => {
    if (!domainId && verified[0]) {
      setDomainId(verified[0].id);
      setEmail(`info@${verified[0].domain}`);
    }
  }, [domainId, verified]);

  const add = useMutation({
    mutationFn: () => settingsApi.addSender(domainId, email.trim(), displayName.trim()),
    onSuccess: () => {
      setDisplayName('');
      setError('');
      void refresh();
    },
    onError: (e: unknown) => setError(e instanceof ApiError ? e.message : 'Не получилось'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => settingsApi.deleteSender(id),
    onSuccess: refresh,
  });

  return (
    <section>
      <SectionHead title="Адреса рассылки" about={<>С этих адресов участники получают письма с документами. На них же придёт ответ, если участник ответит на письмо.</>} />

      {verified.length === 0 ? (
        <div className="mt-4 max-w-2xl rounded-xl bg-[var(--surface-sunken)] p-4 text-sm text-[var(--text-muted)]">
          <p>
            Своих адресов пока нет — и это рабочее состояние. Письма уходят с адреса{' '}
            <code className="font-mono">noreply@vruchay.ru</code>, отправителем участник видит
            название вашей организации.
          </p>
          <p className="mt-2">
            Свой адрес появится, когда будет подтверждён домен:{' '}
            <Link to="/settings/domains" className="text-[var(--accent)] underline">
              подключить домен
            </Link>
            .
          </p>
        </div>
      ) : (
        <>
          <ul className="mt-4 max-w-2xl space-y-2">
            {senders.map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-center gap-3 rounded-xl bg-[var(--surface)] p-3 ring-1 ring-[var(--line)]"
              >
                <div className="min-w-48 flex-1">
                  <p className="text-sm">
                    <span className="font-medium">{s.displayName || 'Без подписи'}</span> &lt;
                    {s.email}&gt;
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--text-muted)]">домен {s.domain}</p>
                </div>
                <Button
                  size="sm"
                  variant="danger"
                  icon={<Trash2 size={14} />}
                  onClick={() => remove.mutate(s.id)}
                  disabled={remove.isPending}
                  aria-label={`Удалить отправителя ${s.email}`}
                />
                <SenderDetails sender={s} onSaved={refresh} />
              </li>
            ))}
          </ul>

          <form
            className="mt-4 flex max-w-2xl flex-wrap items-end gap-3"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              add.mutate();
            }}
          >
            {verified.length > 1 && (
              <div className="min-w-40">
                <Label>Домен</Label>
                <Select
                  value={domainId}
                  onChange={(id) => {
                    setDomainId(id);
                    const d = verified.find((v) => v.id === id);
                    if (d) setEmail(`info@${d.domain}`);
                  }}
                  options={verified.map((d) => ({ value: d.id, label: d.domain }))}
                />
              </div>
            )}
            <div className="min-w-48 flex-1">
              <Label>Адрес отправителя</Label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
            </div>
            <div className="min-w-48 flex-1">
              <Label>Имя в поле «от кого»</Label>
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Центр «Развитие»"
              />
            </div>
            <Button
              type="submit"
              variant="primary"
              icon={<Plus size={16} />}
              disabled={add.isPending}
            >
              Добавить
            </Button>
          </form>
          {error && (
            <p role="alert" className="mt-2 text-sm text-[var(--danger)]">
              {error}
            </p>
          )}
        </>
      )}
    </section>
  );
}

/**
 * Обратный адрес, подпись и проверочное письмо — по каждому отправителю.
 *
 * Свёрнуто по умолчанию: у большинства организаций один адрес и ничего
 * из этого не нужно, а развёрнутая форма на каждой строке превратила бы
 * список в анкету.
 */
function SenderDetails({ sender, onSaved }: { sender: Sender; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [replyTo, setReplyTo] = useState(sender.replyTo);
  const [signature, setSignature] = useState(sender.signature);
  const [note, setNote] = useState('');

  const save = useMutation({
    mutationFn: () =>
      settingsApi.updateSender(sender.id, { replyTo: replyTo.trim(), signature: signature.trim() }),
    onSuccess: () => {
      setNote('Сохранено');
      onSaved();
    },
    onError: (err) => setNote(err instanceof ApiError ? err.message : 'Не получилось сохранить'),
  });

  const test = useMutation({
    mutationFn: () => settingsApi.testSender(sender.id),
    onSuccess: () => setNote('Письмо отправлено вам — проверьте ящик'),
    onError: (err) => setNote(err instanceof ApiError ? err.message : 'Не получилось отправить'),
  });

  if (!open) {
    return (
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        Настроить
      </Button>
    );
  }

  return (
    <div className="w-full space-y-3 border-t border-[var(--line)] pt-3">
      <div>
        <Label>Адрес для ответов</Label>
        <Input
          value={replyTo}
          onChange={(e) => setReplyTo(e.target.value)}
          placeholder={sender.email}
          autoComplete="off"
        />
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          Куда попадёт участник, нажав «Ответить». Пусто — на сам адрес отправителя. Нужно, когда
          письма уходят с noreply, а отвечать человек должен живому адресату.
        </p>
      </div>

      <div>
        <Label>Подпись в конце письма</Label>
        <Textarea
          rows={3}
          value={signature}
          onChange={(e) => setSignature(e.target.value)}
          placeholder="С уважением, приёмная комиссия. Телефон: +7 900 000-00-00"
        />
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          Дописывается к письму о выдаче документа, отделённая чертой. Рекламе здесь не место:
          рекламный кусок делает рекламным всё письмо, а письмо о выдаче уходит без согласия
          на рекламу.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="primary"
          disabled={save.isPending}
          onClick={() => {
            setNote('');
            save.mutate();
          }}
        >
          {save.isPending ? 'Сохраняем…' : 'Сохранить'}
        </Button>
        <Button
          size="sm"
          icon={<Send size={14} />}
          disabled={test.isPending}
          onClick={() => {
            setNote('');
            test.mutate();
          }}
        >
          {test.isPending ? 'Отправляем…' : 'Проверить отправку'}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Свернуть
        </Button>
        {note && <span className="text-sm text-[var(--text-muted)]">{note}</span>}
      </div>
    </div>
  );
}
