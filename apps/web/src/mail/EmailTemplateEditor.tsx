import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bold, ChevronDown, Italic, Paperclip } from 'lucide-react';
import { api, errorText } from '../api/client';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Checkbox } from '../ui/Checkbox';
import { Collapse } from '../ui/Collapse';
import { ErrorBar } from '../ui/ErrorState';
import { Field, Input, Textarea } from '../ui/Field';
import { IconButton } from '../ui/IconButton';
import { toast } from '../ui/Toast';
import { cn } from '../ui/cn';
import { DEFAULT_LETTER } from './letter-defaults';
import { insertToken, parseBody, toHtml, toText, wrapSelection, type Run } from './email-body';
import type { FieldTarget } from '../editor/FieldsSidebar';
import { FieldsToggle } from '../editor/FieldsToggle';

interface EmailTemplate {
  id: string;
  subject: string;
  bodyHtml: string;
  attachGeneratedFile: boolean;
}

/**
 * Письмо, которое получит участник вместе с документом.
 *
 * Человек печатает обычный текст, как в почте: пустая строка — новый абзац,
 * кнопки для полужирного и курсива, адрес сам становится ссылкой. Разметку
 * собирает сервис. Набор возможностей узкий намеренно: почтовые клиенты
 * понимают ограниченный набор тегов, и произвольная вёрстка разъехалась бы
 * в Outlook незаметно для отправителя.
 */
export function EmailTemplateEditor({
  documentId,
  onFieldTarget,
}: {
  documentId: string;
  /** Отдать рамке документа вставку поля — для панели «Данные». */
  onFieldTarget?: (target: FieldTarget | null) => void;
}) {
  const qc = useQueryClient();
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [attach, setAttach] = useState(true);
  const [more, setMore] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  /** Где стоял курсор последним — в теме или в тексте. */
  const lastField = useRef<'subject' | 'body'>('body');
  const subjectRef = useRef<HTMLInputElement | null>(null);

  /**
   * Начертание для выделенного куска. Курсор возвращаем на место сами:
   * без этого он прыгал бы в конец после каждой кнопки.
   */
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

  const template = useQuery({
    queryKey: ['email-template', documentId],
    queryFn: () => api.get<EmailTemplate | null>(`/mail/templates/${documentId}`),
  });

  const columns = useQuery({
    queryKey: ['recipient-columns', documentId],
    queryFn: () => api.get<{ columns: { name: string }[] }>(`/documents/${documentId}/recipients`),
  });

  useEffect(() => {
    if (template.data === undefined) return;
    setSubject(template.data?.subject ?? DEFAULT_LETTER.subject);
    setBody(template.data ? toText(template.data.bodyHtml) : DEFAULT_LETTER.body);
    setAttach(template.data?.attachGeneratedFile ?? true);
  }, [template.data]);

  const save = useMutation({
    mutationFn: () =>
      api.post<EmailTemplate>(`/mail/templates/${documentId}`, {
        subject,
        bodyHtml: toHtml(body),
        attachGeneratedFile: attach,
      }),
    onSuccess: () => {
      toast({ title: 'Письмо сохранено', tone: 'ok' });
      void qc.invalidateQueries({ queryKey: ['email-template', documentId] });
    },
  });

  const variables = columns.data?.columns.map((c) => c.name) ?? [];

  /**
   * Переменная вставляется туда, где стоит курсор, а не в конец текста —
   * и в то поле, где он стоял: в теме письма имя нужно не реже, чем в тексте.
   */
  const insert = useCallback((name: string) => {
    const inSubject = lastField.current === 'subject';
    const field = inSubject ? subjectRef.current : bodyRef.current;
    const set = inSubject ? setSubject : setBody;
    if (!field) {
      set((v) => insertToken(v, v.length, v.length, name).text);
      return;
    }
    const from = field.selectionStart ?? field.value.length;
    const to = field.selectionEnd ?? from;
    const next = insertToken(field.value, from, to, name);
    set(next.text);
    requestAnimationFrame(() => {
      field.focus();
      field.setSelectionRange(next.caret, next.caret);
    });
  }, []);

  const target = useMemo<FieldTarget>(() => ({ insert: (field) => insert(field.source), columnsOnly: true }), [insert]);

  useEffect(() => {
    if (!onFieldTarget) return;
    onFieldTarget(target);
    return () => onFieldTarget(null);
  }, [onFieldTarget, target]);

  return (
    /* По левому краю: у соседних шагов документа содержимое стоит слева,
       и центрированная колонка при переходе к письму уезжала в сторону.
       Узкая колонка нужна только тексту. */
    <div className="w-full max-w-3xl space-y-5 p-4 sm:p-6">
      <header>
        <h2 className="text-lg font-medium">Письмо участнику</h2>
        <p className="mt-1 text-sm text-muted">
          Так выглядит письмо, которое придёт вместе с документом. Отправителем участник увидит название
          вашей организации.
        </p>
      </header>

      <Field label="Тема письма">
        <Input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          onFocus={(e) => {
            lastField.current = 'subject';
            subjectRef.current = e.currentTarget;
          }}
          placeholder={DEFAULT_LETTER.subject}
        />
      </Field>

      <div>
        <div className="mb-1.5 flex items-center gap-1">
          <span className="text-sm font-medium text-muted">Текст письма</span>
          {/* Кнопки, а не разметка руками: человек выделяет кусок и нажимает,
              как в любом мессенджере. Знаки при этом видны в тексте. */}
          <div className="ml-auto flex items-center gap-1">
            <IconButton size="sm" label="Полужирный" onClick={() => applyFormat('*')}>
              <Bold size={16} />
            </IconButton>
            <IconButton size="sm" label="Курсив" onClick={() => applyFormat('_')}>
              <Italic size={16} />
            </IconButton>
            {/* Поля — общей панелью справа, как на листе: вставка идёт
                туда, где стоял курсор, в тему или в текст. */}
            <FieldsToggle />
          </div>
        </div>
        <Textarea
          ref={bodyRef}
          onFocus={() => (lastField.current = 'body')}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={10}
          spellCheck
          aria-label="Текст письма"
        />
        <p className="mt-1.5 text-xs text-muted">Пустая строка — новый абзац. Адрес сайта сам станет ссылкой.</p>
      </div>

      {/* Убрано под раскрывашку: нужно редко — когда документ вручают
          на бумаге, а письмо служит уведомлением. На виду эта галочка
          только пугала. */}
      <Card padding="none">
        <button
          type="button"
          onClick={() => setMore((v) => !v)}
          aria-expanded={more}
          className="pressable flex w-full items-center gap-3 rounded-card px-4 py-3 text-left text-sm hover:bg-row-hover"
        >
          <span className="flex-1 font-medium">Дополнительно</span>
          <ChevronDown size={16} className={cn('text-muted transition-transform', more && 'rotate-180')} aria-hidden />
        </button>
        <Collapse open={more}>
          <div className="border-t border-line px-4 py-3">
            <Checkbox
              checked={attach}
              onChange={setAttach}
              label={
                <span className="flex items-center gap-1.5 font-medium">
                  <Paperclip size={16} aria-hidden /> Прикладывать документ к письму
                </span>
              }
              hint="Обычно нужно: участник получает грамоту прямо в письме. Снимайте, только если вручаете документ на бумаге, а письмо — просто уведомление."
            />
          </div>
        </Collapse>
      </Card>

      <Preview subject={subject} body={body} variables={variables} />

      {save.isError && <ErrorBar>{errorText(save.error)}</ErrorBar>}

      <div className="flex items-center gap-3">
        <Button variant="primary" onClick={() => save.mutate()} loading={save.isPending}>
          Сохранить письмо
        </Button>
      </div>
    </div>
  );
}

/**
 * Как письмо будет выглядеть у получателя.
 *
 * Переменные подставляем примерами, а не оставляем «%name»: смысл
 * предпросмотра в том, чтобы увидеть готовое письмо, а не разметку.
 * Письмо собираем из того же разбора, что уходит на сервер, но рисуем
 * своими элементами, а не вставкой разметки: текст письма набирает
 * сотрудник, а смотрит владелец, и вставка означала бы выполнение
 * чужого скрипта в чужой сессии.
 */
function Preview({ subject, body, variables }: { subject: string; body: string; variables: string[] }) {
  const examples: Record<string, string> = {
    name: 'Иванов Пётр Ильич',
    email: 'participant@example.com',
  };
  for (const v of variables) examples[v] ??= `значение ${v}`;

  const fill = (text: string) => text.replace(/%([a-zA-Z][a-zA-Z0-9_]*)/g, (whole, n: string) => examples[n] ?? whole);
  const paragraphs = parseBody(fill(body));

  return (
    <Card title="Как увидит участник" padding="sm">
      <p className="font-medium">{fill(subject)}</p>
      {/* В цветах кабинета, как и всё вокруг: белая плашка в тёмной теме била по глазам. */}
      <div className="mt-2 rounded-control bg-sunken px-4 py-3 text-base leading-relaxed text-ink">
        {paragraphs.length === 0 ? (
          <p className="text-sm text-muted">Письмо пустое</p>
        ) : (
          paragraphs.map((runs, i) => (
            <p key={i} className={i > 0 ? 'mt-3' : undefined}>
              {runs.map((run, j) => (
                <RunView key={j} run={run} />
              ))}
            </p>
          ))
        )}
      </div>
    </Card>
  );
}

/** Кусок абзаца письма. Набор намеренно узкий — он же и в разметке письма. */
function RunView({ run }: { run: Run }) {
  switch (run.kind) {
    case 'break':
      return <br />;
    case 'bold':
      return <b>{run.text}</b>;
    case 'italic':
      return <i>{run.text}</i>;
    case 'link':
      // Рабочей ссылку не делаем: нажимать её здесь незачем.
      return <span className="text-accent underline">{run.text}</span>;
    default:
      return <>{run.text}</>;
  }
}
