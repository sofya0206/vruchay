import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bold, Check, Eye, Italic, MoreHorizontal, Paperclip, Send, Users } from 'lucide-react';
import { IconButton } from '../ui/IconButton';
import { Menu, MenuItem } from '../ui/Menu';
import { api } from '../api/client';
import type { RecipientTable } from '../api/recipients';
import { Button } from '../ui/Button';
import { Input, Label } from '../ui/Field';
import { toHtml, toText, wrapSelection } from '../mail/email-body';
import { TriplePreview } from './TriplePreview';
import { useMailingTemplate, useSaveTemplate, useTestSend, type Audience, type LetterKind } from './api';

/** Что уйдёт участнику, если письмо не настраивали. */
const DEFAULTS: Record<LetterKind, { subject: string; body: string }> = {
  transactional: {
    subject: 'Ваш документ, %name',
    body: [
      'Здравствуйте, %name!',
      '',
      'Поздравляем! Ваш документ во вложении к этому письму.',
      '',
      'С уважением,',
      'оргкомитет',
    ].join('\n'),
  },
  marketing: {
    subject: 'Приглашаем на следующие мероприятия',
    body: [
      'Здравствуйте, %name!',
      '',
      'Рассказываем о ближайших мероприятиях и о том, как на них попасть.',
    ].join('\n'),
  },
};

/**
 * Письмо для одного материала.
 *
 * Своё на каждый поток: транзакционное и рекламное письма живут отдельными
 * записями и не перезаписывают друг друга. Переключение потока наверху
 * страницы открывает другой текст, а не правит тот же.
 */
export function LetterCard({
  documentId,
  title,
  subtitle,
  kind,
  audience,
  checking,
  onCheck,
}: {
  documentId: string;
  title: string;
  /** Чем этот материал отличается от одноимённых: мероприятие, дата, список. */
  subtitle?: string;
  kind: LetterKind;
  audience?: Audience;
  checking: boolean;
  onCheck: () => void;
}) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [attach, setAttach] = useState(true);
  const [advertiser, setAdvertiser] = useState('');
  const [saved, setSaved] = useState(false);
  const [preview, setPreview] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const template = useMailingTemplate(documentId, kind);
  const save = useSaveTemplate(documentId, kind);
  const test = useTestSend();

  const columns = useQuery({
    queryKey: ['recipients', documentId],
    queryFn: () => api.get<RecipientTable>(`/documents/${documentId}/recipients`),
    select: (table) => table.columns.map((c) => c.name),
  });

  useEffect(() => {
    if (template.data === undefined) return;
    setSubject(template.data?.subject ?? DEFAULTS[kind].subject);
    setBody(template.data ? toText(template.data.bodyHtml) : DEFAULTS[kind].body);
    setAttach(template.data?.attachGeneratedFile ?? kind === 'transactional');
    setAdvertiser(template.data?.advertiserName ?? '');
  }, [template.data, kind]);

  /** Начертание выделенного куска. Курсор возвращаем на место сами. */
  function applyFormat(marker: '*' | '_') {
    const field = bodyRef.current;
    if (!field) return;
    const next = wrapSelection(body, field.selectionStart, field.selectionEnd, marker);
    setBody(next.text);
    requestAnimationFrame(() => {
      field.focus();
      field.setSelectionRange(next.selectionStart, next.selectionEnd);
    });
  }

  function insert(name: string) {
    const field = bodyRef.current;
    const token = `%${name}`;
    if (!field) {
      setBody((b) => b + token);
      return;
    }
    const { selectionStart: from, selectionEnd: to } = field;
    setBody(body.slice(0, from) + token + body.slice(to));
    requestAnimationFrame(() => {
      field.focus();
      field.setSelectionRange(from + token.length, from + token.length);
    });
  }

  function onSave() {
    save.mutate(
      {
        subject,
        bodyHtml: toHtml(body),
        attachGeneratedFile: attach,
        ...(kind === 'marketing' ? { advertiserName: advertiser } : {}),
      },
      {
        onSuccess: () => {
          setSaved(true);
          setTimeout(() => setSaved(false), 2000);
        },
      },
    );
  }

  const variables = columns.data ?? [];

  return (
    <section className="rounded-2xl bg-[var(--surface)] p-5 ring-1 ring-[var(--line)]">
      <header className="mb-4 flex flex-wrap items-center gap-3">
        <h3 className="font-medium">
          {title}
          {subtitle && (
            <span className="block text-sm font-normal text-[var(--text-muted)]">{subtitle}</span>
          )}
        </h3>
        {audience && !audience.refusal && (
          <span className="text-sm text-[var(--text-muted)]">
            уйдёт писем: {audience.willSend}
          </span>
        )}
      </header>

      <div className="space-y-4">
        <div>
          <Label>Тема письма</Label>
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
        </div>

        {kind === 'marketing' && (
          <div>
            <Label>Рекламодатель</Label>
            <Input
              value={advertiser}
              onChange={(e) => setAdvertiser(e.target.value)}
              placeholder="ООО «Ромашка», ИНН 7700000000"
            />
            <p className="mt-1.5 text-xs text-[var(--text-muted)]">
              Попадёт в низ письма рядом с пометкой «Реклама» — этого требует закон.
            </p>
          </div>
        )}

        <div>
          <Label>Текст письма</Label>
          <div className="mb-2 flex items-center gap-1">
            <FormatButton onClick={() => applyFormat('*')} title="Полужирный">
              <Bold size={15} />
            </FormatButton>
            <FormatButton onClick={() => applyFormat('_')} title="Курсив">
              <Italic size={15} />
            </FormatButton>
            <span className="ml-2 text-xs text-[var(--text-muted)]">
              Пустая строка — новый абзац. Адрес сайта сам станет ссылкой.
            </span>
          </div>
          <textarea
            ref={bodyRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={8}
            spellCheck
            className="w-full rounded-xl bg-[var(--surface)] px-3 py-2 text-sm ring-1 ring-[var(--line)] focus:ring-2 focus:ring-[var(--accent)] focus:outline-none"
          />
        </div>

        {variables.length > 0 && (
          <div className="rounded-xl bg-[var(--surface-sunken)] p-3">
            <p className="text-xs text-[var(--text-muted)]">
              Подставить данные получателя — нажмите, чтобы добавить в текст:
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {variables.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => insert(name)}
                  className="rounded-lg bg-[var(--surface)] px-2 py-1 font-mono text-xs ring-1 ring-[var(--line)] hover:ring-[var(--accent)]"
                >
                  %{name}
                </button>
              ))}
            </div>
          </div>
        )}

        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={attach}
            onChange={(e) => setAttach(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            <span className="flex items-center gap-1.5 font-medium">
              <Paperclip size={14} /> Прикладывать документ к письму
            </span>
            <span className="mt-0.5 block text-[var(--text-muted)]">
              Тем, у кого документ ещё не создан, письмо не уйдёт — они попадут в список
              пропущенных.
            </span>
          </span>
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" onClick={onSave} disabled={save.isPending}>
            Сохранить письмо
          </Button>
          <Button variant="ghost" icon={<Eye size={15} />} onClick={() => setPreview(true)}>
            Посмотреть
          </Button>
          <Menu
            align="left"
            trigger={({ open, toggle }) => (
              <IconButton label="Ещё" aria-expanded={open} onClick={toggle}>
                <MoreHorizontal size={18} />
              </IconButton>
            )}
          >
            <MenuItem
              icon={<Send size={16} />}
              disabled={test.isPending}
              onClick={() => test.mutate({ documentId, kind })}
            >
              Отправить письмо себе
            </MenuItem>
            <MenuItem icon={<Users size={16} />} disabled={checking} onClick={onCheck}>
              {checking ? 'Считаем…' : 'Кому уйдёт'}
            </MenuItem>
          </Menu>

          {saved && (
            <span className="flex items-center gap-1.5 text-sm text-[var(--accent)]">
              <Check size={15} /> Сохранено
            </span>
          )}
          {test.isSuccess && (
            <span className="text-sm text-[var(--accent)]">
              Письмо отправлено на {test.data.to}
            </span>
          )}
          {(save.isError || test.isError) && (
            <span className="text-sm text-[var(--danger)]">
              {((save.error ?? test.error) as Error).message}
            </span>
          )}
        </div>

        {audience && <AudienceReport audience={audience} />}
      </div>

      {preview && (
        <TriplePreview
          documentId={documentId}
          kind={kind}
          subject={subject}
          body={body}
          advertiserName={advertiser}
          onClose={() => setPreview(false)}
        />
      )}
    </section>
  );
}

/** Кому уйдёт и кому не уйдёт — поимённо, а не числом. */
function AudienceReport({ audience }: { audience: Audience }) {
  if (audience.refusal) {
    return (
      <p className="rounded-xl bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">
        {audience.refusal}
      </p>
    );
  }

  return (
    <div className="rounded-xl bg-[var(--surface-sunken)] p-4 text-sm">
      <p>
        Писем уйдёт: <b>{audience.willSend}</b>
      </p>

      {audience.skipped.length > 0 && (
        <details className="mt-3" open={audience.willSend === 0}>
          <summary className="cursor-pointer text-[var(--text-muted)]">
            Не уйдёт: {audience.skipped.length} — посмотреть причины
          </summary>
          <ul className="mt-2 space-y-1">
            {audience.skipped.slice(0, 100).map((item, i) => (
              <li key={`${item.email}-${i}`} className="flex flex-wrap gap-x-2">
                <span className="font-medium">{item.name || item.email || 'Без имени'}</span>
                <span className="text-[var(--text-muted)]">— {item.reason}</span>
              </li>
            ))}
          </ul>
          {audience.skipped.length > 100 && (
            <p className="mt-2 text-[var(--text-muted)]">
              …и ещё {audience.skipped.length - 100}
            </p>
          )}
        </details>
      )}
    </div>
  );
}

function FormatButton({
  onClick,
  title,
  children,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <IconButton size="sm" label={title} onClick={onClick} className="hairline">
      {children}
    </IconButton>
  );
}
