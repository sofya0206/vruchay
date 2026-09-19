import { FormEvent, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, LifeBuoy, MessageSquarePlus } from 'lucide-react';
import { supportApi, useTicket, useTickets, type TicketStatus } from '../api/support';
import { usePreferences } from '../api/org';
import { ApiError } from '../api/client';
import { Button } from '../ui/Button';
import { Input, Label, StatusChip, Textarea } from '../ui/Field';
import { formatDateTime } from './preferences';

const STATUS: Record<TicketStatus, { title: string; tone: 'done' | 'progress' | 'neutral' }> = {
  open: { title: 'Ждёт ответа', tone: 'progress' },
  answered: { title: 'Мы ответили', tone: 'done' },
  closed: { title: 'Закрыто', tone: 'neutral' },
};

/**
 * Обращения в поддержку.
 *
 * Переписка привязана к организации, а не к человеку: спрашивает один
 * сотрудник, а разбирается потом другой, и терять переписку на этом
 * переходе нельзя. Список и открытое обращение — один экран: обращений
 * у организации единицы, отдельная страница на каждое не нужна.
 */
export function Support() {
  const tickets = useTickets();
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const prefs = usePreferences();
  const format = prefs.data?.dateFormat;

  if (openId) return <TicketView id={openId} onBack={() => setOpenId(null)} />;

  return (
    <section>
      <h2 className="flex items-center gap-2 text-lg font-medium">
        <LifeBuoy size={18} className="text-[var(--accent)]" />
        Поддержка
      </h2>
      <p className="mt-1 max-w-2xl text-sm text-[var(--text-muted)] max-md:hidden">
        Отвечаем в рабочие часы по Москве. Если документы уже раздают, а что-то не работает — так и
        напишите в первой строке: такие обращения разбираем первыми.
      </p>

      {creating ? (
        <NewTicket
          onDone={(id) => {
            setCreating(false);
            setOpenId(id);
          }}
          onCancel={() => setCreating(false)}
        />
      ) : (
        <Button
          className="mt-4"
          variant="primary"
          icon={<MessageSquarePlus size={16} />}
          onClick={() => setCreating(true)}
        >
          Написать в поддержку
        </Button>
      )}

      {tickets.data?.length === 0 && !creating && (
        <p className="mt-4 text-sm text-[var(--text-muted)]">Обращений ещё не было.</p>
      )}

      <ul className="mt-4 max-w-2xl space-y-2">
        {tickets.data?.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              onClick={() => setOpenId(t.id)}
              className="w-full rounded-xl bg-[var(--surface)] p-3 text-left ring-1 ring-[var(--line)] hover:ring-[var(--line-strong)]"
            >
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{t.subject}</span>
                <StatusChip tone={STATUS[t.status].tone}>{STATUS[t.status].title}</StatusChip>
              </span>
              <span className="mt-1 block text-xs text-[var(--text-muted)]">
                {t.author || 'Сотрудник'} · сообщений: {t.messages} · обновлено{' '}
                {formatDateTime(t.updatedAt, format)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function NewTicket({ onDone, onCancel }: { onDone: (id: string) => void; onCancel: () => void }) {
  const qc = useQueryClient();
  const [subject, setSubject] = useState('');
  const [text, setText] = useState('');
  const [error, setError] = useState('');

  const create = useMutation({
    mutationFn: () => supportApi.create(subject.trim(), text.trim()),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ['support-tickets'] });
      onDone(r.id);
    },
    onError: (e: unknown) => setError(e instanceof ApiError ? e.message : 'Не получилось'),
  });

  return (
    <form
      className="mt-4 max-w-2xl space-y-3 rounded-2xl bg-[var(--surface)] p-4 ring-1 ring-[var(--line)]"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        create.mutate();
      }}
    >
      <div>
        <Label>Тема</Label>
        <Input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          maxLength={200}
          placeholder="Не уходят письма участникам"
        />
      </div>
      <div>
        <Label hint="Чем подробнее, тем меньше уточняющих писем">Что случилось</Label>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={5000}
          rows={5}
          placeholder="Выпустили 120 грамот, нажали «Разослать» — статус «в очереди» уже час."
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" variant="primary" disabled={create.isPending}>
          {create.isPending ? 'Отправляем…' : 'Отправить'}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Отмена
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-[var(--danger)]">
          {error}
        </p>
      )}
    </form>
  );
}

function TicketView({ id, onBack }: { id: string; onBack: () => void }) {
  const qc = useQueryClient();
  const { data } = useTicket(id);
  const [text, setText] = useState('');
  const prefs = usePreferences();
  const format = prefs.data?.dateFormat;

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['support-ticket', id] });
    void qc.invalidateQueries({ queryKey: ['support-tickets'] });
  };

  const reply = useMutation({
    mutationFn: () => supportApi.reply(id, text.trim()),
    onSuccess: () => {
      setText('');
      refresh();
    },
  });

  const close = useMutation({ mutationFn: () => supportApi.close(id), onSuccess: refresh });

  if (!data) return null;

  return (
    <section>
      <Button variant="ghost" size="sm" icon={<ChevronLeft size={16} />} onClick={onBack}>
        Все обращения
      </Button>

      <h2 className="mt-2 flex flex-wrap items-center gap-2 text-lg font-medium">
        {data.subject}
        <StatusChip tone={STATUS[data.status].tone}>{STATUS[data.status].title}</StatusChip>
      </h2>

      <ul className="mt-4 max-w-2xl space-y-3">
        {data.messages.map((m) => (
          <li
            key={m.id}
            className={`rounded-xl p-3 ring-1 ${
              m.fromSupport
                ? 'bg-[var(--accent-soft)] ring-[var(--accent)]/30'
                : 'bg-[var(--surface)] ring-[var(--line)]'
            }`}
          >
            <p className="text-xs text-[var(--text-muted)]">
              {m.author || 'Сотрудник'} · {formatDateTime(m.createdAt, format)}
            </p>
            {/* Перенос строк сохраняем: человек писал абзацами, а не одной строкой. */}
            <p className="mt-1 whitespace-pre-wrap text-sm">{m.text}</p>
          </li>
        ))}
      </ul>

      <form
        className="mt-4 max-w-2xl space-y-3"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          if (text.trim()) reply.mutate();
        }}
      >
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={5000}
          rows={4}
          placeholder="Дополнить обращение"
        />
        <div className="flex gap-2">
          <Button type="submit" variant="primary" disabled={reply.isPending || !text.trim()}>
            Отправить
          </Button>
          {data.status !== 'closed' && (
            <Button type="button" onClick={() => close.mutate()} disabled={close.isPending}>
              Вопрос решён
            </Button>
          )}
        </div>
      </form>
    </section>
  );
}
