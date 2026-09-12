import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bold, Check, Italic, Paperclip } from 'lucide-react';
import { api } from '../api/client';
import { Button } from '../ui/Button';
import { Input, Label } from '../ui/Field';
import { parseBody, toHtml, toText, wrapSelection, type Run } from './email-body';
import { Checkbox } from '../ui/Checkbox';

interface EmailTemplate {
  id: string;
  subject: string;
  bodyHtml: string;
  attachGeneratedFile: boolean;
}

/** Что придёт участнику, если письмо не настраивали. */
const DEFAULT_SUBJECT = 'Ваш документ, %name';
const DEFAULT_BODY = [
  'Здравствуйте, %name!',
  '',
  'Поздравляем! Ваш документ во вложении к этому письму.',
  '',
  'С уважением,',
  'оргкомитет',
].join('\n');

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
export function EmailTemplateEditor({ documentId }: { documentId: string }) {
  const qc = useQueryClient();
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [attach, setAttach] = useState(true);
  const [saved, setSaved] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

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
    setSubject(template.data?.subject ?? DEFAULT_SUBJECT);
    setBody(template.data ? toText(template.data.bodyHtml) : DEFAULT_BODY);
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

  /** Переменная вставляется туда, где стоит курсор, а не в конец текста. */
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

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-6">
      <header>
        <h2 className="font-serif text-xl">Письмо участнику</h2>
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
          placeholder={DEFAULT_SUBJECT}
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
          <span className="ml-2 text-xs text-[var(--text-muted)]">
            Пустая строка — новый абзац. Адрес сайта сам станет ссылкой.
          </span>
        </div>

        <textarea
          ref={bodyRef}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={10}
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
      <div className="mt-2 rounded-lg bg-white px-4 py-3 text-[15px] leading-relaxed text-[#1a1a1a]">
        {paragraphs.length === 0 ? (
          <p className="text-sm text-neutral-400">Письмо пустое</p>
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
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className="grid h-8 w-8 place-items-center rounded-lg text-[var(--text-muted)] ring-1 ring-[var(--line)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text)]"
    >
      {children}
    </button>
  );
}
