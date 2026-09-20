import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Bold, Italic, Lock, Plus, Send, Users } from 'lucide-react';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { Input, Label, Textarea } from '../ui/Field';
import { Dialog } from '../ui/Dialog';
import { toHtml, toText, wrapSelection } from '../mail/email-body';
import { parseEmailCount } from './text-mailing';
import { KindPicker } from './KindPicker';
import {
  useSaveTextMailing,
  useTextAudience,
  useTextMailing,
  useTextSend,
  useTextTest,
  type LetterKind,
  type TextAudience,
  type TextMailing,
  type TextSendResult,
} from './api';
import { errorText } from '../api/client';

/**
 * Рассылка текстом: письмо списку адресов без документа.
 *
 * Черновик сохраняется сам перед каждым действием — «Себе», «Кому уйдёт»,
 * «Отправить», — а его номер живёт в адресе (`draft=`): обновление
 * страницы не теряет набранное, а ссылку на черновик можно дать коллеге.
 *
 * После отправки текст заморожен сервером. Дослать тем, кого забыли,
 * можно тем же письмом: дубли не уйдут.
 */
export function TextMailingForm() {
  const [params, setParams] = useSearchParams();
  const draftId = params.get('draft');

  const [kind, setKind] = useState<LetterKind>('transactional');
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [advertiser, setAdvertiser] = useState('');
  const [emails, setEmails] = useState('');
  const [audience, setAudience] = useState<TextAudience | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [sent, setSent] = useState<TextSendResult | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const draft = useTextMailing(draftId);
  const save = useSaveTextMailing();
  const check = useTextAudience();
  const test = useTextTest();
  const send = useTextSend();

  // Черновик из адреса — в поля, один раз на черновик.
  const loaded = useRef<string | null>(null);
  useEffect(() => {
    if (!draft.data || loaded.current === draft.data.id) return;
    loaded.current = draft.data.id;
    setKind(draft.data.kind);
    setName(draft.data.name);
    setSubject(draft.data.subject);
    setBody(toText(draft.data.bodyHtml));
    setAdvertiser(draft.data.advertiserName ?? '');
  }, [draft.data]);

  const locked = Boolean(draft.data?.locked);
  const addresses = parseEmailCount(emails);
  const busy = save.isPending || check.isPending || send.isPending;
  const error = [save, check, test, send].find((m) => m.isError)?.error as Error | undefined;

  /** Сохранить набранное и вернуть номер черновика. Замороженный не трогаем. */
  async function persist(): Promise<string> {
    if (draftId && locked) return draftId;
    const saved: TextMailing = await save.mutateAsync({
      id: draftId,
      draft: {
        name,
        kind,
        subject,
        bodyHtml: toHtml(body),
        ...(kind === 'marketing' ? { advertiserName: advertiser } : {}),
      },
    });
    if (saved.id !== draftId) {
      loaded.current = saved.id;
      const next = new URLSearchParams(params);
      next.set('draft', saved.id);
      setParams(next, { replace: true });
    }
    return saved.id;
  }

  async function onCheck() {
    const id = await persist();
    setAudience(await check.mutateAsync({ id, emails }));
  }

  async function onSendClick() {
    await onCheck();
    setConfirm(true);
  }

  async function onTest() {
    const id = await persist();
    test.mutate(id);
  }

  function onConfirm() {
    if (!draftId) return;
    send.mutate(
      { id: draftId, emails },
      {
        onSuccess: (result) => {
          setConfirm(false);
          setSent(result);
          setAudience(null);
        },
      },
    );
  }

  /** С чистого листа: черновик уходит из адреса, поля пустеют. */
  function startOver() {
    const next = new URLSearchParams(params);
    next.delete('draft');
    setParams(next, { replace: true });
    loaded.current = null;
    setKind('transactional');
    setName('');
    setSubject('');
    setBody('');
    setAdvertiser('');
    setEmails('');
    setSent(null);
    setAudience(null);
  }

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

  const ready = name.trim() && subject.trim() && body.trim() && addresses > 0;

  return (
    <div className="space-y-5">
      <KindPicker
        kind={kind}
        textOnly
        disabled={locked}
        onChange={(next) => {
          setKind(next);
          setAudience(null);
        }}
      />

      {locked && (
        <p className="flex items-center gap-2 rounded-card bg-sunken px-4 py-3 text-sm">
          <Lock size={15} className="shrink-0 text-muted" />
          <span className="flex-1">Ушла — текст не меняется</span>
          <Button variant="ghost" icon={<Plus size={15} />} onClick={startOver}>
            Новая
          </Button>
        </p>
      )}

      <div>
        <Label>Название</Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Перенос церемонии"
          disabled={locked}
          maxLength={200}
        />
      </div>

      <div>
        <Label>Тема письма</Label>
        <Input value={subject} onChange={(e) => setSubject(e.target.value)} disabled={locked} />
      </div>

      {kind === 'marketing' && (
        <div>
          <Label>Рекламодатель</Label>
          <Input
            value={advertiser}
            onChange={(e) => setAdvertiser(e.target.value)}
            placeholder="ООО «Ромашка», ИНН 7700000000"
            disabled={locked}
          />
        </div>
      )}

      <div>
        <Label>Текст</Label>
        {!locked && (
          <div className="mb-2 flex items-center gap-1">
            <IconButton
              size="sm"
              label="Полужирный"
              onClick={() => applyFormat('*')}
              className="hairline"
            >
              <Bold size={15} />
            </IconButton>
            <IconButton
              size="sm"
              label="Курсив"
              onClick={() => applyFormat('_')}
              className="hairline"
            >
              <Italic size={15} />
            </IconButton>
          </div>
        )}
        <textarea
          ref={bodyRef}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          disabled={locked}
          rows={8}
          spellCheck
          className="w-full rounded-card bg-surface px-3 py-2 text-sm ring-1 ring-line focus:ring-2 focus:ring-accent focus:outline-none disabled:bg-sunken"
        />
      </div>

      <div>
        <Label>
          Кому
          {addresses > 0 && (
            <span className="ml-2 font-normal text-muted tabular-nums">
              {addresses}
            </span>
          )}
        </Label>
        <Textarea
          value={emails}
          onChange={(e) => {
            setEmails(e.target.value);
            setAudience(null);
          }}
          rows={5}
          spellCheck={false}
          placeholder={'ivanov@example.ru\npetrov@example.ru'}
          aria-label="Список адресов"
          className="font-mono text-sm"
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="primary"
          icon={<Send size={16} />}
          disabled={!ready || busy}
          onClick={() => void onSendClick()}
        >
          Отправить
        </Button>
        <Button
          variant="ghost"
          icon={<Users size={15} />}
          disabled={!ready || busy}
          onClick={() => void onCheck()}
        >
          Кому уйдёт
        </Button>
        <Button
          variant="ghost"
          disabled={!name.trim() || !subject.trim() || !body.trim() || busy || test.isPending}
          onClick={() => void onTest()}
        >
          Себе
        </Button>
        {test.isSuccess && <span className="text-sm text-accent">→ {test.data.to}</span>}
        {error && <span className="text-sm text-danger">{errorText(error)}</span>}
      </div>

      {audience && !confirm && <AudienceLine audience={audience} />}
      {sent && <SentLine result={sent} />}

      {confirm && audience && (
        <Dialog
          title={`Отправить «${name.trim()}»`}
          onClose={() => setConfirm(false)}
          footer={
            <>
              <Button
                variant="primary"
                onClick={onConfirm}
                disabled={send.isPending || Boolean(audience.refusal) || audience.willSend === 0}
              >
                {send.isPending ? 'Отправляем…' : `Отправить ${audience.willSend}`}
              </Button>
              <Button onClick={() => setConfirm(false)}>Отмена</Button>
            </>
          }
        >
          <AudienceLine audience={audience} />
          {/* Отправленное не отзывается — предупреждаем до нажатия. */}
          <p className="mt-3 text-sm text-muted">
            Отозвать письма после отправки нельзя.
          </p>
          {kind === 'marketing' && (
            <p className="mt-2 text-sm text-muted">
              Только тем, кто согласился на рекламу, — с пометкой и отпиской.
            </p>
          )}
        </Dialog>
      )}
    </div>
  );
}

/** Кому уйдёт — числом, а кому нет — поимённо с причиной. */
function AudienceLine({ audience }: { audience: TextAudience }) {
  if (audience.refusal) {
    return (
      <p className="rounded-card bg-danger-soft px-4 py-3 text-sm text-danger">
        {audience.refusal}
      </p>
    );
  }
  return (
    <div className="rounded-card bg-sunken px-4 py-3 text-sm">
      <p className="flex flex-wrap gap-x-4">
        <span>
          Уйдёт: <b className="tabular-nums">{audience.willSend}</b>
        </span>
        {audience.skipped.length > 0 && (
          <span className="text-danger">
            Не уйдёт: <b className="tabular-nums">{audience.skipped.length}</b>
          </span>
        )}
      </p>
      <Skipped items={audience.skipped} />
    </div>
  );
}

function SentLine({ result }: { result: TextSendResult }) {
  return (
    <div className="rounded-card bg-ok-soft px-4 py-3 text-sm">
      <p>
        В очереди: <b className="tabular-nums">{result.queued}</b>
      </p>
      <Skipped items={result.skipped} />
    </div>
  );
}

function Skipped({ items }: { items: TextAudience['skipped'] }) {
  if (items.length === 0) return null;
  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-muted">Причины</summary>
      <ul className="mt-1 space-y-0.5">
        {items.slice(0, 100).map((item, i) => (
          <li key={`${item.email}-${i}`}>
            <span className="font-mono">{item.email || '—'}</span>
            <span className="text-muted"> — {item.reason}</span>
          </li>
        ))}
      </ul>
      {items.length > 100 && (
        <p className="mt-1 text-muted">…и ещё {items.length - 100}</p>
      )}
    </details>
  );
}
