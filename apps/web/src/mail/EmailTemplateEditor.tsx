import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bold, Check, Italic, Paperclip } from 'lucide-react';
import { api } from '../api/client';
import { Button } from '../ui/Button';
import { Input, Label } from '../ui/Field';
import { DEFAULT_LETTER } from './letter-defaults';
import { insertToken, parseBody, toHtml, toText, wrapSelection, type Run } from './email-body';
import { Checkbox } from '../ui/Checkbox';
import { useTooltip } from '../ui/Tooltip';
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
 * До этого экрана участнику уходило безличное «Ваш документ во вложении»,
 * и поменять это было нельзя — хотя сервер умел с самого начала.
 *
 * Человек печатает обычный текст, как в почте: пустая строка — новый абзац,
 * кнопки для полужирного и курсива, адрес сам становится ссылкой. Разметку
 * собирает сервис. Раньше в поле лежало «<p>Здравствуйте</p>» — теги в лицо
 * тому, кто просто хочет поздравить участника.
 *
 * Набор возможностей узкий намеренно: почтовые клиенты понимают ограниченный
 * набор тегов, и произвольная вёрстка разъехалась бы в Outlook незаметно
 * для отправителя.
 */
export function EmailTemplateEditor({
  documentId,
  onFieldTarget,
}: {
  documentId: string;
  /** Отдать рамке материала вставку поля — для панели «Данные». */
  onFieldTarget?: (target: FieldTarget | null) => void;
}) {
  const qc = useQueryClient();
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [attach, setAttach] = useState(true);
  const [saved, setSaved] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  /** Где стоял курсор последним — в теме или в тексте. */
  const lastField = useRef<'subject' | 'body'>('body');
  const subjectRef = useRef<HTMLInputElement | null>(null);

  /**
   * Начертание для выделенного куска.
   *
   * Курсор возвращаем на место сами: без этого он прыгал бы в конец
   * после каждой кнопки, и продолжать набор было бы невозможно.
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
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
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

  const target = useMemo<FieldTarget>(
    () => ({
      insert: (field) => insert(field.source),
      columnsOnly: true,
    }),
    [insert],
  );

  useEffect(() => {
    if (!onFieldTarget) return;
    onFieldTarget(target);
    return () => onFieldTarget(null);
  }, [onFieldTarget, target]);

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-6">
      <header>
        <h2 className="text-lg font-medium">Письмо участнику</h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Так выглядит письмо, которое придёт вместе с документом. Отправителем участник
          увидит название вашей организации.
        </p>
      </header>

      <div>
        <Label>Тема письма</Label>
        <Input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          onFocus={(e) => {
            lastField.current = 'subject';
            subjectRef.current = e.currentTarget;
          }}
          placeholder={DEFAULT_LETTER.subject}
        />
      </div>

      <div>
        <Label>Текст письма</Label>

        {/* Кнопки, а не разметка руками: человек выделяет кусок и нажимает,
            как в любом мессенджере. Знаки при этом видны в тексте —
            это честнее скрытого форматирования, где непонятно, где
            начертание начинается и где кончается. */}
        <div className="mb-2 flex items-center gap-1">
          <FormatButton onClick={() => applyFormat('*')} title="Полужирный">
            <Bold size={15} />
          </FormatButton>
          <FormatButton onClick={() => applyFormat('_')} title="Курсив">
            <Italic size={15} />
          </FormatButton>
          {/* Поля — общей панелью справа, как на листе: вставка идёт
              туда, где стоял курсор, в тему или в текст. */}
          <FieldsToggle />
          <span className="ml-2 text-xs text-[var(--text-muted)]">
            Пустая строка — новый абзац. Адрес сайта сам станет ссылкой.
          </span>
        </div>

        <textarea
          ref={bodyRef}
          onFocus={() => (lastField.current = 'body')}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={10}
          spellCheck
          className="w-full rounded-xl bg-[var(--surface)] px-3 py-2 text-sm ring-1 ring-[var(--line)] focus:ring-2 focus:ring-[var(--accent)] focus:outline-none"
        />
      </div>

      {/* Убрано под спойлер: нужно редко — когда документ вручают на бумаге,
          а письмо служит уведомлением. На виду эта галочка только пугала:
          непонятно, зачем снимать то, ради чего всё и затевалось. */}
      <details className="rounded-xl bg-[var(--surface-sunken)] px-4 py-3">
        <summary className="cursor-pointer text-sm text-[var(--text-muted)]">
          Дополнительно
        </summary>
        <label className="mt-3 flex items-start gap-3 text-sm">
          <Checkbox checked={attach} onChange={setAttach} className="mt-0.5" />
          <span>
            <span className="flex items-center gap-1.5 font-medium">
              <Paperclip size={14} /> Прикладывать документ к письму
            </span>
            <span className="mt-0.5 block text-[var(--text-muted)]">
              Обычно нужно: участник получает грамоту прямо в письме. Снимайте, только
              если вручаете документ на бумаге, а письмо — просто уведомление.
            </span>
          </span>
        </label>
      </details>

      <Preview subject={subject} body={body} variables={variables} />

      <div className="flex items-center gap-3">
        <Button variant="primary" onClick={() => save.mutate()} disabled={save.isPending}>
          Сохранить
        </Button>
        {saved && (
          <span className="flex items-center gap-1.5 text-sm text-[var(--accent)]">
            <Check size={15} /> Сохранено
          </span>
        )}
        {save.isError && (
          <span className="text-sm text-[var(--danger)]">
            {(save.error as Error).message}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Как письмо будет выглядеть у получателя.
 *
 * Переменные подставляем примерами, а не оставляем «%name»: смысл
 * предпросмотра в том, чтобы увидеть готовое письмо, а не разметку.
 */
function Preview({
  subject,
  body,
  variables,
}: {
  subject: string;
  body: string;
  variables: string[];
}) {
  const examples: Record<string, string> = {
    name: 'Иванов Пётр Ильич',
    email: 'participant@example.com',
  };
  for (const v of variables) examples[v] ??= `значение ${v}`;

  const fill = (text: string) =>
    text.replace(/%([a-zA-Z][a-zA-Z0-9_]*)/g, (whole, n: string) => examples[n] ?? whole);

  /*
   * Письмо собираем из того же разбора, что уходит на сервер, но рисуем
   * своими элементами, а не вставкой разметки.
   *
   * Разметку в страницу кабинета вставлять нельзя: текст письма набирает
   * сотрудник организации, а смотрит его владелец, и вставка означала бы
   * выполнение чужого скрипта в чужой сессии. Раньше здесь стояло вложенное
   * окно с песочницей — задачу оно решало, но пустело при перерисовке
   * страницы, и вместо письма человек видел белый прямоугольник.
   *
   * Своя отрисовка снимает обе проблемы разом: подставить сюда разметку
   * попросту нечем, а рисуется предпросмотр как обычная часть страницы.
   * Расхождения с письмом при этом не возникает — разбор общий.
   */
  const paragraphs = parseBody(fill(body));

  return (
    <div className="rounded-xl bg-[var(--surface-sunken)] p-4">
      <p className="text-xs text-[var(--text-muted)]">Как увидит участник</p>
      <p className="mt-2 font-medium">{fill(subject)}</p>

      {/* Белый фон и тёмный текст независимо от темы кабинета: письмо
          человек откроет в почте, а не здесь. */}
      <div className="mt-2 rounded-lg bg-[var(--sheet-paper)] px-4 py-3 text-[15px] leading-relaxed text-[var(--sheet-ink)]">
        {paragraphs.length === 0 ? (
          <p className="text-sm text-[var(--sheet-ink-muted)]">Письмо пустое</p>
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
    </div>
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
      // Рабочей ссылку не делаем: нажимать её здесь незачем, а уводить
      // человека со страницы настройки письма — тем более.
      return <span className="text-[#1F5D3F] underline">{run.text}</span>;
    default:
      return <>{run.text}</>;
  }
}

/** Кнопка начертания над полем ввода. */
function FormatButton({
  onClick,
  title,
  children,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const { triggerProps, tooltip } = useTooltip(title);

  return (
    <button
      type="button"
      onClick={onClick}
      {...triggerProps}
      aria-label={title}
      className="grid h-8 w-8 place-items-center rounded-lg text-[var(--text-muted)] ring-1 ring-[var(--line)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text)]"
    >
      {children}
      {tooltip}
    </button>
  );
}
