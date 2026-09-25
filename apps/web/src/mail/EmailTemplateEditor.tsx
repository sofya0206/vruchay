import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Editor } from '@tiptap/core';
import { Bold, ChevronDown, Italic, Paperclip, Send } from 'lucide-react';
import { api, errorText } from '../api/client';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Checkbox } from '../ui/Checkbox';
import { Collapse } from '../ui/Collapse';
import { IconButton } from '../ui/IconButton';
import { toast } from '../ui/Toast';
import { cn } from '../ui/cn';
import { DEFAULT_LETTER } from './letter-defaults';
import { parseBody, toHtml, toText, type Run } from './email-body';
import { toggleLetterMark } from './letter-doc';
import { LetterInput } from './LetterInput';
import type { FieldTarget } from '../editor/FieldsSidebar';
import { FieldsToggle } from '../editor/FieldsToggle';
import type { FieldInfo } from '../editor/fields';
import { useLetterFields } from './useLetterFields';

interface EmailTemplate {
  id: string;
  subject: string;
  bodyHtml: string;
  attachGeneratedFile: boolean;
}

const AUTOSAVE_DELAY_MS = 1500;

/**
 * Письмо, которое получит участник вместе с документом.
 *
 * Человек печатает обычный текст, как в почте: Enter — новый абзац,
 * кнопки для полужирного и курсива, адрес сам становится ссылкой, данные
 * из таблицы — фишками. Разметку собирает сервис. Набор возможностей
 * узкий намеренно: почтовые клиенты
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
  const [saved, setSaved] = useState<'saved' | 'saving' | 'dirty' | 'error'>('saved');
  const subjectEditor = useRef<Editor | null>(null);
  const bodyEditor = useRef<Editor | null>(null);
  /** Где стоял курсор последним — в теме или в тексте. */
  const lastField = useRef<'subject' | 'body'>('body');
  /** Для какого документа уже пришли данные — до этого поля не показываем и не сохраняем. */
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  /** Сразу после загрузки поля меняются сами — это не правка человека. */
  const justLoaded = useRef(false);
  const version = useRef(0);
  const latestVersion = useRef(0);

  const template = useQuery({
    queryKey: ['email-template', documentId],
    queryFn: () => api.get<EmailTemplate | null>(`/mail/templates/${documentId}`),
  });

  const { fields, labels, known } = useLetterFields(documentId);

  /*
   * Письмо берём с сервера один раз на документ. Ответ на каждое
   * автосохранение приходил бы сюда же и затирал бы то, что человек
   * успел напечатать, пока запрос шёл.
   */
  useEffect(() => {
    if (template.data === undefined || loadedFor === documentId) return;
    setSubject(template.data?.subject ?? DEFAULT_LETTER.subject);
    setBody(template.data ? toText(template.data.bodyHtml) : DEFAULT_LETTER.body);
    setAttach(template.data?.attachGeneratedFile ?? true);
    setLoadedFor(documentId);
    justLoaded.current = true;
  }, [template.data, documentId, loadedFor]);

  const save = useMutation({
    mutationFn: (data: { subject: string; bodyHtml: string; attachGeneratedFile: boolean; version: number }) =>
      api.post<EmailTemplate>(`/mail/templates/${documentId}`, {
        subject: data.subject,
        bodyHtml: data.bodyHtml,
        attachGeneratedFile: data.attachGeneratedFile,
      }),
    onSuccess: (_data, sent) => {
      if (sent.version === latestVersion.current) setSaved('saved');
      void qc.invalidateQueries({ queryKey: ['email-template', documentId] });
    },
    // Без этого упавший запрос оставлял бы значок на «Сохраняем» навсегда.
    onError: () => setSaved('error'),
  });

  /*
   * Автосохранение — как у листа: остальные шаги документа не требуют
   * отдельной кнопки, и письмо не должно быть исключением, которое молча
   * теряет набранное при переходе на соседний шаг.
   */
  useEffect(() => {
    if (loadedFor !== documentId) return;
    // Значения только что подставились с сервера — это не правка человека.
    if (justLoaded.current) {
      justLoaded.current = false;
      return;
    }
    setSaved('dirty');
    // Сервер отвергает пустую тему — заявка, которая точно не пройдёт, не нужна;
    // «Есть правки» выше уже показывает, что письмо не сохранено.
    if (!subject.trim()) return;
    version.current += 1;
    const mine = version.current;
    latestVersion.current = mine;
    const timer = setTimeout(() => {
      setSaved('saving');
      save.mutate({ subject, bodyHtml: toHtml(body), attachGeneratedFile: attach, version: mine });
    }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
    // Намеренно без объекта мутации: он пересоздаётся на каждый рендер
    // и в зависимостях сбрасывал бы таймер бесконечно.
  }, [subject, body, attach, documentId, loadedFor]);

  // Шлёт черновик из состояния, а не сохранённый шаблон — работает
  // и до первого автосохранения, и без единой строки получателей.
  const testSend = useMutation({
    mutationFn: () =>
      api.post<{ to: string }>(`/mail/templates/${documentId}/test-send`, {
        subject,
        bodyHtml: toHtml(body),
        attachGeneratedFile: attach,
      }),
    onSuccess: (result) => toast({ title: `Отправили на ${result.to}`, tone: 'ok' }),
    onError: (err) => toast({ title: 'Не отправилось', description: errorText(err), tone: 'danger' }),
  });

  /**
   * Поле вставляется туда, где стоит курсор, а не в конец текста —
   * и в то поле, где он стоял: в теме письма имя нужно не реже, чем в тексте.
   * Редактор помнит выделение и после ухода фокуса на панель.
   */
  const insert = useCallback((field: FieldInfo) => {
    const editor = lastField.current === 'subject' ? subjectEditor.current : bodyEditor.current;
    editor
      ?.chain()
      .focus()
      .insertContent([
        { type: 'mergeField', attrs: { source: field.source, fieldId: field.fieldId } },
        { type: 'text', text: ' ' },
      ])
      .run();
  }, []);

  const target = useMemo<FieldTarget>(() => ({ insert, columnsOnly: true }), [insert]);
  const onSubjectEditor = useCallback((e: Editor | null) => {
    subjectEditor.current = e;
  }, []);
  const onBodyEditor = useCallback((e: Editor | null) => {
    bodyEditor.current = e;
  }, []);

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
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium">Письмо участнику</h2>
          <p className="mt-1 text-sm text-muted">
            Так выглядит письмо, которое придёт вместе с документом. Отправителем участник увидит название
            вашей организации.
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <Badge dot tone={saved === 'saved' ? 'ok' : saved === 'error' ? 'danger' : 'neutral'}>
            {saved === 'saved'
              ? 'Сохранено'
              : saved === 'saving'
                ? 'Сохраняем…'
                : saved === 'error'
                  ? 'Не сохранилось'
                  : 'Есть правки'}
          </Badge>
          <Button
            variant="secondary"
            size="sm"
            icon={<Send size={16} />}
            loading={testSend.isPending}
            disabled={!subject.trim()}
            onClick={() => testSend.mutate()}
            data-tour="letter-test-send"
          >
            Отправить тестовое себе
          </Button>
        </div>
      </header>

      {loadedFor === documentId && (
        <>
          <div>
            <span className="mb-1.5 block text-sm font-medium text-muted">Тема письма</span>
            <LetterInput
              key={`subject-${documentId}`}
              initialValue={subject}
              onChange={setSubject}
              multiline={false}
              fields={fields}
              labels={labels}
              known={known}
              onFocus={() => (lastField.current = 'subject')}
              onEditor={onSubjectEditor}
              placeholder="Например: Ваш документ"
              ariaLabel="Тема письма"
            />
          </div>

          <div>
            <div className="mb-1.5 flex items-center gap-1">
              <span className="text-sm font-medium text-muted">Текст письма</span>
              {/* Кнопки, а не разметка руками: человек выделяет кусок и нажимает,
                  как в любом мессенджере. */}
              <div className="ml-auto flex items-center gap-1" data-tour="letter-fields">
                <IconButton
                  size="sm"
                  label="Полужирный"
                  onClick={() => bodyEditor.current && toggleLetterMark(bodyEditor.current, 'bold')}
                >
                  <Bold size={16} />
                </IconButton>
                <IconButton
                  size="sm"
                  label="Курсив"
                  onClick={() => bodyEditor.current && toggleLetterMark(bodyEditor.current, 'italic')}
                >
                  <Italic size={16} />
                </IconButton>
                {/* Поля — общей панелью справа, как на листе: вставка идёт
                    туда, где стоял курсор, в тему или в текст. */}
                <FieldsToggle />
              </div>
            </div>
            <LetterInput
              key={`body-${documentId}`}
              initialValue={body}
              onChange={setBody}
              multiline
              fields={fields}
              labels={labels}
              known={known}
              onFocus={() => (lastField.current = 'body')}
              onEditor={onBodyEditor}
              ariaLabel="Текст письма"
            />
            <p className="mt-1.5 text-xs text-muted">
              Enter — новый абзац, Shift+Enter — перенос строки. Данные из таблицы — кнопкой «Данные» или
              набрав @. Адрес сайта сам станет ссылкой.
            </p>
          </div>
        </>
      )}

      {/* Убрано под раскрывашку: нужно редко — когда документ вручают
          на бумаге, а письмо служит уведомлением. На виду эта галочка
          только пугала. */}
      <Card padding="none" data-tour="letter-attach">
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

      <Preview subject={subject} body={body} variables={fields.map((f) => f.source)} />
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
